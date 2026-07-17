#!/usr/bin/env python3
"""
뮬(mule.co.kr) 중고장터 키워드 알림 봇

중고장터에 새 글이 올라오면 설정한 키워드와 매칭하여
텔레그램으로 알림을 보내주는 스크립트입니다.

사용법:
    python mule_monitor.py                  # 상시 감시 (interval_seconds 주기)
    python mule_monitor.py --once           # 한 번만 확인하고 종료 (cron용)
    python mule_monitor.py --test-telegram  # 텔레그램 설정 테스트
"""

import argparse
import html
import json
import re
import sys
import time
import logging
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── 파일 경로 ───────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
SEEN_PATH = BASE_DIR / "seen_posts.json"
DEBUG_HTML_PATH = BASE_DIR / "debug_last_page.html"

# ── 로깅 설정 ───────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mule_monitor")

# ── 기본 HTTP 헤더 ──────────────────────────────────────────
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.mule.co.kr/",
}

# ── 뮬 중고장터 게시판 URL ──────────────────────────────────
BOARD_URLS = {
    "sell": "https://www.mule.co.kr/bbs/market/sell",  # 팝니다
    "buy": "https://www.mule.co.kr/bbs/market/buy",    # 삽니다
    "premium": "https://www.mule.co.kr/bbs/market",    # 프리미엄 장터
}

# 사이트에 부담을 주지 않도록 확인 주기 하한선을 둡니다
MIN_INTERVAL_SECONDS = 60


def load_config() -> dict:
    """config.json 로드 및 검증"""
    if not CONFIG_PATH.exists():
        log.error(f"설정 파일이 없습니다: {CONFIG_PATH}")
        log.error("config.json.example을 참고하여 config.json을 만들어 주세요.")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    errors = []
    keywords = config.get("keywords")
    if not isinstance(keywords, list) or not keywords:
        errors.append("keywords: 감시할 키워드를 1개 이상 넣어 주세요.")

    tg = config.get("telegram", {})
    token = str(tg.get("bot_token", ""))
    chat_id = str(tg.get("chat_id", ""))
    if not token or "여기에" in token or ":" not in token:
        errors.append("telegram.bot_token: BotFather에게 받은 봇 토큰을 넣어 주세요.")
    if not chat_id or "여기에" in chat_id:
        errors.append("telegram.chat_id: 채팅 ID를 넣어 주세요.")

    for board in config.get("boards", ["sell"]):
        if board not in BOARD_URLS:
            errors.append(
                f"boards: 알 수 없는 게시판 '{board}' "
                f"(사용 가능: {', '.join(BOARD_URLS)})"
            )

    if errors:
        for e in errors:
            log.error(f"설정 오류 — {e}")
        sys.exit(1)

    return config


def load_seen_posts() -> set:
    """이미 확인한 게시글 ID 목록 로드"""
    if not SEEN_PATH.exists():
        return set()
    with open(SEEN_PATH, "r", encoding="utf-8") as f:
        return set(json.load(f))


def save_seen_posts(seen: set):
    """확인한 게시글 ID 저장 (최근 5000개만 유지)"""
    # 게시글 ID는 숫자 문자열이므로 숫자 기준으로 정렬해야
    # 최신 글이 아닌 오래된 글이 잘려 나갑니다
    def sort_key(pid: str):
        return (0, int(pid)) if pid.isdigit() else (1, 0)

    recent = sorted(seen, key=sort_key)[-5000:]
    with open(SEEN_PATH, "w", encoding="utf-8") as f:
        json.dump(recent, f)


def send_telegram(bot_token: str, chat_id: str, message: str) -> bool:
    """텔레그램 메시지 전송. 성공 여부를 반환."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }
    for attempt in range(2):
        try:
            resp = requests.post(url, json=payload, timeout=10)
        except requests.RequestException as e:
            log.error(f"텔레그램 전송 오류: {e}")
            return False

        if resp.status_code == 200:
            log.info("텔레그램 알림 전송 완료")
            return True

        if resp.status_code == 429 and attempt == 0:
            try:
                retry_after = resp.json()["parameters"]["retry_after"]
            except (ValueError, KeyError):
                retry_after = 3
            log.warning(f"텔레그램 rate limit — {retry_after}초 후 재시도")
            time.sleep(retry_after)
            continue

        log.error(f"텔레그램 전송 실패: {resp.status_code} {resp.text}")
        return False
    return False


def build_full_url(href: str) -> str:
    """상대 경로를 절대 URL로 변환"""
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return f"https://www.mule.co.kr{href}"
    return f"https://www.mule.co.kr/{href}"


def make_post(link_tag, container=None) -> dict | None:
    """링크 태그(+선택적 컨테이너 행/카드)에서 게시글 정보 추출"""
    href = link_tag.get("href", "")
    if not href:
        return None

    idx_match = re.search(r"idx=(\d+)", href)
    post_id = idx_match.group(1) if idx_match else href

    title = link_tag.get_text(strip=True)
    price = ""
    date = ""
    if container is not None:
        title_tag = container.select_one(".title, .subject, h3, h4, .item-title")
        if title_tag:
            title = title_tag.get_text(strip=True) or title
        price_tag = container.select_one("td.price, .price, .item-price")
        if price_tag:
            price = price_tag.get_text(strip=True)
        date_tag = container.select_one("td.date, .date, time, .item-date")
        if date_tag:
            date = date_tag.get_text(strip=True)

    if not title:
        return None

    return {
        "id": post_id,
        "title": title,
        "url": build_full_url(href),
        "price": price,
        "date": date,
    }


def dedupe_posts(posts: list[dict]) -> list[dict]:
    """같은 글이 여러 링크(썸네일/제목 등)로 잡힌 경우 제목이 긴 항목 하나만 유지"""
    by_id: dict[str, dict] = {}
    for p in posts:
        prev = by_id.get(p["id"])
        if prev is None or len(p["title"]) > len(prev["title"]):
            by_id[p["id"]] = p
    return list(by_id.values())


def fetch_posts(board_url: str) -> list[dict]:
    """
    게시판 페이지를 파싱하여 게시글 목록을 반환합니다.

    반환 형식: [{"id": str, "title": str, "url": str, "price": str, "date": str}, ...]
    """
    session = requests.Session()
    session.headers.update(HEADERS)

    try:
        resp = session.get(board_url, timeout=15)
        resp.raise_for_status()
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        log.error(f"페이지 요청 실패 ({board_url}): HTTP {status}")
        if status == 403:
            log.error(
                "사이트가 자동화 접근을 차단했을 수 있습니다. "
                "확인 주기를 늘리거나, 실제 브라우저의 쿠키를 HEADERS에 추가해 보세요."
            )
        return []
    except requests.RequestException as e:
        log.error(f"페이지 요청 실패 ({board_url}): {e}")
        return []

    # charset 헤더가 없으면 requests가 ISO-8859-1로 읽어 한글이 깨지므로 보정
    content_type = resp.headers.get("Content-Type", "")
    if "charset" not in content_type.lower():
        resp.encoding = resp.apparent_encoding

    soup = BeautifulSoup(resp.text, "html.parser")
    posts: list[dict] = []

    # 뮬 게시판은 여러 가지 HTML 구조를 사용할 수 있으므로 다양한 선택자 시도
    # 방법 1: 일반적인 게시판 테이블 구조 (tr 기반)
    rows = soup.select("table.board-list tbody tr, table.list tbody tr, .board-list tr")
    if rows:
        for row in rows:
            link_tag = row.select_one("a[href*='idx=']") or row.select_one(
                "td.title a, td.subject a, .title a, .subject a"
            )
            if link_tag:
                post = make_post(link_tag, row)
                if post:
                    posts.append(post)

    # 방법 2: div/li 카드 형태 구조
    if not posts:
        items = soup.select(
            ".market-list li, .market-item, .board-item, "
            ".list-item, article.post, .sell-list li, .item-card"
        )
        for item in items:
            link_tag = item.select_one("a[href*='idx=']") or item.select_one("a")
            if link_tag:
                post = make_post(link_tag, item)
                if post:
                    posts.append(post)

    # 방법 3: 모든 idx= 링크를 찾기 (폴백)
    if not posts:
        for link_tag in soup.select("a[href*='idx=']"):
            href = link_tag.get("href", "")
            # 메뉴/네비게이션 링크 제외
            if "market" not in href and "bbs" not in href:
                continue
            post = make_post(link_tag)
            if post and len(post["title"]) >= 3:
                posts.append(post)

    if not posts:
        # 선택자가 실제 사이트 구조와 안 맞을 때 원인 파악용 스냅샷
        DEBUG_HTML_PATH.write_text(resp.text, encoding="utf-8")
        log.warning(
            f"게시글을 찾지 못했습니다. 페이지 HTML을 {DEBUG_HTML_PATH.name}에 "
            f"저장했으니 열어서 실제 게시판 구조를 확인해 주세요. "
            f"(내용이 거의 비어 있다면 JavaScript 렌더링 사이트라 Playwright 방식이 필요합니다)"
        )

    return dedupe_posts(posts)


def matches_keywords(title: str, keywords: list[str]) -> list[str]:
    """제목이 키워드와 매칭되는지 확인. 매칭된 키워드 목록 반환."""
    title_lower = title.lower()
    return [kw for kw in keywords if kw.lower() in title_lower]


def format_telegram_message(post: dict, matched_keywords: list[str]) -> str:
    """텔레그램 알림 메시지 포맷 (HTML parse_mode용 이스케이프 포함)"""
    esc = lambda s: html.escape(str(s), quote=True)
    lines = [
        "🎸 <b>뮬 중고장터 알림</b>",
        "",
        f"📌 <b>{esc(post['title'])}</b>",
    ]
    if post.get("price"):
        lines.append(f"💰 {esc(post['price'])}")
    if post.get("date"):
        lines.append(f"📅 {esc(post['date'])}")
    lines.append(f"🔑 매칭 키워드: <code>{esc(', '.join(matched_keywords))}</code>")
    lines.append("")
    lines.append(f'🔗 <a href="{esc(post["url"])}">글 보기</a>')
    return "\n".join(lines)


def run_once(config: dict, seen: set, first_run: bool) -> int:
    """한 번 실행: 새 글 확인 → 키워드 매칭 → 알림 전송. 알림 건수 반환."""
    keywords = config["keywords"]
    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]
    boards = config.get("boards", ["sell"])
    alert_on_first_run = config.get("alert_on_first_run", False)

    alert_count = 0

    for board in boards:
        board_url = BOARD_URLS[board]
        log.info(f"[{board}] 게시글 확인 중... ({board_url})")
        posts = fetch_posts(board_url)
        log.info(f"[{board}] {len(posts)}개 게시글 발견")

        for post in posts:
            if post["id"] in seen:
                continue
            seen.add(post["id"])

            # 첫 실행 시에는 기존 글을 기록만 하고 알림은 보내지 않습니다
            # (게시판에 이미 있는 글 전체에 알림이 쏟아지는 것 방지)
            if first_run and not alert_on_first_run:
                continue

            matched = matches_keywords(post["title"], keywords)
            if matched:
                log.info(f"  ✓ 매칭! [{', '.join(matched)}] {post['title']}")
                msg = format_telegram_message(post, matched)
                send_telegram(bot_token, chat_id, msg)
                alert_count += 1
                time.sleep(0.5)  # 텔레그램 rate limit 방지

        time.sleep(1)  # 게시판 간 요청 간격

    save_seen_posts(seen)
    return alert_count


def main():
    parser = argparse.ArgumentParser(description="뮬 중고장터 키워드 알림 봇")
    parser.add_argument(
        "--once", action="store_true",
        help="한 번만 확인하고 종료 (cron 등 외부 스케줄러 사용 시)"
    )
    parser.add_argument(
        "--test-telegram", action="store_true",
        help="텔레그램 테스트 메시지를 보내고 종료 (설정 확인용)"
    )
    args = parser.parse_args()

    config = load_config()

    if args.test_telegram:
        ok = send_telegram(
            config["telegram"]["bot_token"],
            config["telegram"]["chat_id"],
            "🔔 뮬 알림 봇 테스트 메시지입니다. 설정이 올바릅니다!",
        )
        sys.exit(0 if ok else 1)

    interval = config.get("interval_seconds", 300)  # 기본 5분
    if interval < MIN_INTERVAL_SECONDS:
        log.warning(
            f"interval_seconds={interval}는 너무 짧아 사이트에 부담을 줍니다. "
            f"{MIN_INTERVAL_SECONDS}초로 조정합니다."
        )
        interval = MIN_INTERVAL_SECONDS

    keywords = config["keywords"]
    first_run = not SEEN_PATH.exists()
    seen = load_seen_posts()

    log.info("=" * 50)
    log.info("뮬 중고장터 키워드 알림 봇 시작")
    log.info(f"  감시 키워드: {', '.join(keywords)}")
    log.info(f"  감시 게시판: {', '.join(config.get('boards', ['sell']))}")
    log.info(f"  확인 주기: {interval}초")
    if first_run:
        log.info("  첫 실행: 기존 게시글은 기록만 하고 알림은 보내지 않습니다")
    log.info("=" * 50)

    if args.once:
        alert_count = run_once(config, seen, first_run)
        log.info(f"확인 완료 — {alert_count}건 알림 전송.")
        return

    # 상시 감시 모드 시작 알림
    send_telegram(
        config["telegram"]["bot_token"],
        config["telegram"]["chat_id"],
        f"✅ 뮬 중고장터 알림 봇이 시작되었습니다.\n"
        f"감시 키워드: {', '.join(keywords)}\n"
        f"확인 주기: {interval}초",
    )

    while True:
        try:
            alert_count = run_once(config, seen, first_run)
            first_run = False
            log.info(f"확인 완료 — {alert_count}건 알림 전송. 다음 확인까지 {interval}초 대기.")
        except Exception as e:
            log.exception(f"실행 중 오류 발생: {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
