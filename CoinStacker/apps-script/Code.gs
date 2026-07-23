/**
 * 동전쌓기 공유 랭킹 서버 (Google Apps Script)
 *
 * 독립형 스크립트/시트 연결형 어느 쪽이든 동작한다:
 * 시트에 바인딩돼 있으면 그 시트를 쓰고, 아니면 최초 호출 때
 * "동전쌓기 랭킹" 스프레드시트를 자동 생성해 ID를 저장해 둔다.
 *
 * 설치: 코드 붙여넣고 저장 → 배포 → 배포 관리 → 수정(연필) →
 * 버전 "새 버전" + 액세스 "모든 사용자" → 배포 (URL 유지됨)
 */

const SHEET_NAME = 'scores';

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('SHEET_ID');
  if (saved) {
    try {
      return SpreadsheetApp.openById(saved);
    } catch (ignored) {} // 삭제된 경우 아래에서 새로 확보
  }
  const active = SpreadsheetApp.getActiveSpreadsheet(); // 시트 연결형이면 존재
  if (active) {
    props.setProperty('SHEET_ID', active.getId());
    return active;
  }
  const created = SpreadsheetApp.create('동전쌓기 랭킹'); // 독립형이면 자동 생성
  props.setProperty('SHEET_ID', created.getId());
  return created;
}

function getSheet_() {
  const ss = getSpreadsheet_();
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
      .map(function (r) {
        return { name: String(r[1]), height: Number(r[2]) || 0, coins: Number(r[3]) || 0 };
      })
      .sort(function (a, b) { return b.height - a.height || b.coins - a.coins; })
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
    const higher = sh.getDataRange().getValues().slice(1)
      .filter(function (r) { return Number(r[2]) > height; }).length;
    return json_({ ok: true, rank: higher + 1 });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}
