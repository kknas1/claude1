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
    "telegram": {
        "bot_token": "7123456789:AAH...",
        "chat_id": "123456789"
    }
}
```

- **keywords**: 알림 받을 키워드 목록 (대소문자 구분 없음)
- **boards**: 감시할 게시판 (`sell`=팝니다, `buy`=삽니다, `premium`=프리미엄)
- **interval_seconds**: 확인 주기 (초 단위, 기본 300초=5분)

## 4. 실행

```bash
pip install -r requirements.txt
python mule_monitor.py
```

## 5. 백그라운드 실행 (선택)

```bash
# nohup 사용
nohup python mule_monitor.py > mule_monitor.log 2>&1 &

# 또는 systemd 서비스로 등록 (Linux)
# 또는 screen/tmux 활용
```
