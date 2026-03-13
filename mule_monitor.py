#!/usr/bin/env python3
"""
뮬(mule.co.kr) 중고장터 키워드 알림 봇

중고장터에 새 글이 올라오면 설정한 키워드와 매칭하여
텔레그램으로 알림을 보내주는 스크립트입니다.
"""

import json
import os
import re
import sys
import time
import logging
from pathlib import Path
from datetime import datetime

import requests
from bs4 import BeautifulSoup

# ── 설정 파일 경로 ──────────────────────────────────────────
CONFIG_PATH = Path(__file__).parent / "config.json"
SEEN_PATH = Path(__file__).parent / "seen_posts.json"

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
    "sell": "https://www.mule.co.kr/bbs/market/sell",       # 팝니다
    "buy": "https://www.mule.co.kr/bbs/market/buy",         # 삽니다
    "premium": "https://www.mule.co.kr/bbs/market/premium",  # 프리미엄
}


def load_config() -> dict:
    """config.json 로드"""
    if not CONFIG_PATH.exists():
        log.error(f"설정 파일이 없습니다: {CONFIG_PATH}")
        log.error("config.json.example을 참고하여 config.json을 만들어 주세요.")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_seen_posts() -> set:
    """이미 알림을 보낸 게시글 ID 목록 로드"""
    if not SEEN_PATH.exists():
        return set()
    with open(SEEN_PATH, "r", encoding="utf-8") as f:
        return set(json.load(f))


def save_seen_posts(seen: set):
    """알림을 보낸 게시글 ID 저장 (최근 5000개만 유지)"""
    recent = sorted(seen)[-5000:]
    with open(SEEN_PATH, "w", encoding="utf-8") as f:
        json.dump(recent, f)


def send_telegram(bot_token: str, chat_id: str, message: str):
    """텔레그램 메시지 전송"""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code != 200:
            log.error(f"텔레그램 전송 실패: {resp.status_code} {resp.text}")
        else:
            log.info("텔레그램 알림 전송 완료")
    except requests.RequestException as e:
        log.error(f"텔레그램 전송 오류: {e}")


def fetch_posts(board_url: str) -> list[dict]:
    """
    게시판 페이지를 파싱하여 게시글 목록을 반환합니다.

    반환 형식: [{"id": str, "title": str, "url": str, "price": str, "date": str}, ...]
    """
    posts = []
    session = requests.Session()
    session.headers.update(HEADERS)

    try:
        resp = session.get(board_url, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.error(f"페이지 요청 실패 ({board_url}): {e}")
        return posts

    soup = BeautifulSoup(resp.text, "html.parser")

    # 뮬 게시판은 여러 가지 HTML 구조를 사용할 수 있으므로 다양한 선택자 시도
    # 방법 1: 일반적인 게시판 테이블 구조 (tr 기반)
    rows = soup.select("table.board-list tbody tr, table.list tbody tr, .board-list tr")

    if rows:
        for row in rows:
            link_tag = row.select_one("a[href*='idx=']")
            if not link_tag:
                link_tag = row.select_one("td.title a, td.subject a, .title a, .subject a")
            if not link_tag:
                continue

            href = link_tag.get("href", "")
            title = link_tag.get_text(strip=True)

            # idx 추출
            idx_match = re.search(r"idx=(\d+)", href)
            post_id = idx_match.group(1) if idx_match else href

            # 절대 URL 만들기
            if href.startswith("/"):
                full_url = f"https://www.mule.co.kr{href}"
            elif href.startswith("http"):
                full_url = href
            else:
                full_url = f"https://www.mule.co.kr/{href}"

            # 가격 추출 시도
            price_tag = row.select_one("td.price, .price, td:nth-child(3)")
            price = price_tag.get_text(strip=True) if price_tag else ""

            # 날짜 추출 시도
            date_tag = row.select_one("td.date, .date, td:nth-child(4), time")
            date = date_tag.get_text(strip=True) if date_tag else ""

            posts.append({
                "id": post_id,
                "title": title,
                "url": full_url,
                "price": price,
                "date": date,
            })
        return posts

    # 방법 2: div/li 카드 형태 구조
    items = soup.select(
        ".market-list li, .market-item, .board-item, "
        ".list-item, article.post, .sell-list li, .item-card"
    )

    if items:
        for item in items:
            link_tag = item.select_one("a[href*='idx=']")
            if not link_tag:
                link_tag = item.select_one("a")
            if not link_tag:
                continue

            href = link_tag.get("href", "")
            # 제목: 별도 태그 혹은 링크 텍스트
            title_tag = item.select_one(".title, .subject, h3, h4, .item-title")
            title = title_tag.get_text(strip=True) if title_tag else link_tag.get_text(strip=True)

            idx_match = re.search(r"idx=(\d+)", href)
            post_id = idx_match.group(1) if idx_match else href

            if href.startswith("/"):
                full_url = f"https://www.mule.co.kr{href}"
            elif href.startswith("http"):
                full_url = href
            else:
                full_url = f"https://www.mule.co.kr/{href}"

            price_tag = item.select_one(".price, .item-price")
            price = price_tag.get_text(strip=True) if price_tag else ""

            date_tag = item.select_one(".date, time, .item-date")
            date = date_tag.get_text(strip=True) if date_tag else ""

            posts.append({
                "id": post_id,
                "title": title,
                "url": full_url,
                "price": price,
                "date": date,
            })
        return posts

    # 방법 3: 모든 idx= 링크를 찾기 (폴백)
    all_links = soup.select("a[href*='idx=']")
    for link_tag in all_links:
        href = link_tag.get("href", "")
        title = link_tag.get_text(strip=True)
        if not title or len(title) < 3:
            continue
        # 메뉴/네비게이션 링크 제외
        if "market" not in href and "bbs" not in href:
            continue

        idx_match = re.search(r"idx=(\d+)", href)
        post_id = idx_match.group(1) if idx_match else href

        if href.startswith("/"):
            full_url = f"https://www.mule.co.kr{href}"
        elif href.startswith("http"):
            full_url = href
        else:
            full_url = f"https://www.mule.co.kr/{href}"

        posts.append({
            "id": post_id,
            "title": title,
            "url": full_url,
            "price": "",
            "date": "",
        })

    return posts


def matches_keywords(title: str, keywords: list[str]) -> list[str]:
    """제목이 키워드와 매칭되는지 확인. 매칭된 키워드 목록 반환."""
    title_lower = title.lower()
    matched = []
    for kw in keywords:
        if kw.lower() in title_lower:
            matched.append(kw)
    return matched


def format_telegram_message(post: dict, matched_keywords: list[str]) -> str:
    """텔레그램 알림 메시지 포맷"""
    kw_str = ", ".join(matched_keywords)
    lines = [
        f"🎸 <b>뮬 중고장터 알림</b>",
        f"",
        f"📌 <b>{post['title']}</b>",
    ]
    if post.get("price"):
        lines.append(f"💰 {post['price']}")
    if post.get("date"):
        lines.append(f"📅 {post['date']}")
    lines.append(f"🔑 매칭 키워드: <code>{kw_str}</code>")
    lines.append(f"")
    lines.append(f"🔗 <a href=\"{post['url']}\">글 보기</a>")
    return "\n".join(lines)


def run_once(config: dict) -> int:
    """한 번 실행: 새 글 확인 → 키워드 매칭 → 알림 전송. 알림 건수 반환."""
    keywords = config["keywords"]
    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]
    boards = config.get("boards", ["sell"])

    seen = load_seen_posts()
    alert_count = 0

    for board in boards:
        board_url = BOARD_URLS.get(board)
        if not board_url:
            log.warning(f"알 수 없는 게시판: {board}")
            continue

        log.info(f"[{board}] 게시글 확인 중... ({board_url})")
        posts = fetch_posts(board_url)
        log.info(f"[{board}] {len(posts)}개 게시글 발견")

        for post in posts:
            if post["id"] in seen:
                continue

            matched = matches_keywords(post["title"], keywords)
            if matched:
                log.info(f"  ✓ 매칭! [{', '.join(matched)}] {post['title']}")
                msg = format_telegram_message(post, matched)
                send_telegram(bot_token, chat_id, msg)
                alert_count += 1
                time.sleep(0.5)  # 텔레그램 rate limit 방지

            seen.add(post["id"])

    save_seen_posts(seen)
    return alert_count


def main():
    config = load_config()
    interval = config.get("interval_seconds", 300)  # 기본 5분
    keywords = config["keywords"]

    log.info("=" * 50)
    log.info("뮬 중고장터 키워드 알림 봇 시작")
    log.info(f"  감시 키워드: {', '.join(keywords)}")
    log.info(f"  감시 게시판: {', '.join(config.get('boards', ['sell']))}")
    log.info(f"  확인 주기: {interval}초")
    log.info("=" * 50)

    # 시작 알림
    send_telegram(
        config["telegram"]["bot_token"],
        config["telegram"]["chat_id"],
        f"✅ 뮬 중고장터 알림 봇이 시작되었습니다.\n"
        f"감시 키워드: {', '.join(keywords)}\n"
        f"확인 주기: {interval}초",
    )

    while True:
        try:
            alert_count = run_once(config)
            log.info(f"확인 완료 — {alert_count}건 알림 전송. 다음 확인까지 {interval}초 대기.")
        except Exception as e:
            log.exception(f"실행 중 오류 발생: {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
