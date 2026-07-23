/**
 * 동전쌓기 공유 랭킹 서버 (Google Apps Script)
 *
 * 설치 방법:
 * 1. https://sheets.new 에서 새 구글 시트 생성
 * 2. 메뉴: 확장 프로그램 → Apps Script
 * 3. 이 파일 내용 전체를 붙여넣고 저장
 * 4. 우상단 "배포" → "새 배포" → 유형 "웹 앱"
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5. "배포" 클릭 → 권한 승인 → 웹 앱 URL(…/exec) 복사
 * 6. 그 URL을 game.js 의 RANK_URL 에 넣으면 끝
 */

const SHEET_NAME = 'scores';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['ts', 'name', 'height', 'coins']);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET → 상위 50명 랭킹
function doGet() {
  try {
    const rows = getSheet_().getDataRange().getValues().slice(1);
    const scores = rows
      .map((r) => ({
        name: String(r[1]),
        height: Number(r[2]) || 0,
        coins: Number(r[3]) || 0,
      }))
      .sort((a, b) => b.height - a.height || b.coins - a.coins)
      .slice(0, 50);
    return json_({ ok: true, scores: scores });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// POST {name, height, coins} → 기록 등록, 현재 순위 반환
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const d = JSON.parse(e.postData.contents);
    const name = String(d.name || '익명').trim().slice(0, 12) || '익명';
    const height = Math.max(0, Math.min(100000, Math.round(Number(d.height) || 0)));
    const coins = Math.max(0, Math.min(100000, Math.round(Number(d.coins) || 0)));
    if (height <= 0) return json_({ ok: false, error: 'empty score' });

    const sh = getSheet_();
    sh.appendRow([new Date(), name, height, coins]);
    const higher = sh
      .getDataRange()
      .getValues()
      .slice(1)
      .filter((r) => Number(r[2]) > height).length;
    return json_({ ok: true, rank: higher + 1 });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}
