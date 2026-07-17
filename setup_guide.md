# 뮬 중고장터 키워드 알림 봇 설정 가이드

## 1. 텔레그램 봇 만들기

1. 텔레그램에서 **@BotFather** 를 검색하여 대화를 시작합니다
2. `/newbot` 명령어를 입력합니다
3. 봇 이름과 username을 설정합니다
4. **bot_token** 이 발급됩니다 (예: `7123456789:AAH...` 형태)

## 2. Chat ID 확인하기

1. 만든 봇에게 아무 메시지를 보냅니다
2. 브라우저에서 아래 URL을 열어 chat_id를 확인합니다:
   ```
   https://api.telegram.org/bot{봇토큰}/getUpdates
   ```
3. 응답에서 `"chat":{"id":숫자}` 부분이 **chat_id** 입니다

## 3. 설정 파일 만들기

```bash
cp config.json.example config.json
```

`config.json`을 열어서 수정합니다:

```json
{
    "keywords": ["fender", "gibson", "PRS"],
    "boards": ["sell", "buy"],
    "interval_seconds": 300,
    "alert_on_first_run": false,
    "telegram": {
        "bot_token": "7123456789:AAH...",
        "chat_id": "123456789"
    }
}
```

- **keywords**: 알림 받을 키워드 목록 (대소문자 구분 없음, 제목에 포함되면 매칭)
- **boards**: 감시할 게시판 (`sell`=팝니다, `buy`=삽니다, `premium`=프리미엄)
- **interval_seconds**: 확인 주기 (초 단위, 기본 300초=5분, 최소 60초)
- **alert_on_first_run**: 첫 실행 시 게시판에 이미 있는 글도 알림할지 여부.
  기본값 `false` — 첫 실행에서는 기존 글을 기록만 하고, 이후 올라오는 새 글부터 알림합니다.

> `config.json`에는 봇 토큰이 들어가므로 `.gitignore`에 등록되어 있습니다. 커밋하지 마세요.

## 4. 실행

```bash
pip install -r requirements.txt

# 텔레그램 설정이 맞는지 먼저 테스트
python mule_monitor.py --test-telegram

# 상시 감시 시작
python mule_monitor.py
```

## 5. 백그라운드 실행 (선택)

```bash
# nohup 사용
nohup python mule_monitor.py > mule_monitor.log 2>&1 &

# 또는 cron으로 5분마다 실행 (상시 실행 대신)
# crontab -e 에 추가:
# */5 * * * * cd /path/to/claude1 && python3 mule_monitor.py --once >> mule_monitor.log 2>&1
```

## 문제 해결

### "게시글을 찾지 못했습니다" 경고가 나올 때

스크립트가 페이지는 받아왔지만 게시글 목록을 파싱하지 못한 경우입니다.
같은 폴더에 저장되는 `debug_last_page.html`을 브라우저로 열어 보세요.

- **게시글이 보인다면**: 뮬의 실제 HTML 구조에 맞게 `fetch_posts()`의 CSS 선택자를
  수정해야 합니다. 개발자 도구(F12)로 게시글 목록의 태그/클래스를 확인하세요.
- **거의 빈 페이지라면**: JavaScript로 렌더링되는 페이지이므로 `requests` 대신
  Playwright 같은 브라우저 자동화 도구가 필요합니다.

### HTTP 403 오류가 나올 때

사이트가 자동화 접근을 차단한 경우입니다. 확인 주기를 늘리거나,
실제 브라우저로 접속한 상태의 쿠키를 복사해 `HEADERS`에 `Cookie` 항목으로 추가해 보세요.

### 참고

- 이 스크립트는 개인적인 용도의 가벼운 모니터링을 위한 것입니다.
  확인 주기를 지나치게 짧게 설정해 사이트에 부담을 주지 마세요 (최소 60초로 제한됨).
