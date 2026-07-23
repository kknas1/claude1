/**
 * 두더지 잡기 — 공유 순위판 백엔드 (Google Apps Script)
 *
 * 설치 방법:
 *  1. https://script.google.com 접속 (구글 로그인)
 *  2. "새 프로젝트" → 기본 코드를 지우고 이 파일 전체를 붙여넣기 → 저장
 *  3. 우측 상단 "배포" > "새 배포" > 유형 선택(톱니바퀴): "웹 앱"
 *     - 실행 계정: 나
 *     - 액세스 권한: 모든 사용자
 *  4. "배포" 클릭 → 웹 앱 URL 복사 (https://script.google.com/macros/s/…/exec)
 *  5. 그 URL을 game.js 의 BOARD_URL 에 넣으면 연결 완료
 *
 * API:
 *  GET                      -> {"scores":[...]}  점수순 상위 50개
 *  POST {"scores":[...]}    -> 보내온 기록을 병합/검증 후 전체 순위 반환
 *
 * 저장소는 스크립트 속성(PropertiesService)이라 별도 시트가 필요 없습니다.
 */
var STORE_KEY = 'scores';
var STORE_MAX = 50;

function doGet() {
  return respond({ scores: load() });
}

function doPost(e) {
  var incoming = [];
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (Array.isArray(body.scores)) incoming = body.scores;
  } catch (err) {
    // malformed body -> merge nothing, still return the current board
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var merged = merge(load(), incoming);
    PropertiesService.getScriptProperties().setProperty(STORE_KEY, JSON.stringify(merged));
    return respond({ scores: merged });
  } finally {
    lock.releaseLock();
  }
}

function load() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(STORE_KEY);
    var v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (err) {
    return [];
  }
}

function merge(current, incoming) {
  var seen = {};
  var out = [];
  current.concat(incoming).forEach(function (r) {
    var c = clean(r);
    if (!c || seen[c.id]) return;
    seen[c.id] = true;
    out.push(c);
  });
  out.sort(function (a, b) {
    return (b.score - a.score) || (a.date - b.date);
  });
  return out.slice(0, STORE_MAX);
}

// Entries come from an open endpoint, so clamp every field server-side.
function clean(r) {
  if (!r || typeof r !== 'object') return null;
  var id = String(r.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  var name = String(r.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  var score = Math.round(Number(r.score));
  var moles = Math.round(Number(r.moles));
  var date = Math.round(Number(r.date));
  if (!id || !name) return null;
  if (!isFinite(score) || score < 0 || score > 1000000) return null;
  return {
    id: id,
    name: name,
    score: score,
    moles: isFinite(moles) ? Math.max(0, Math.min(100000, moles)) : 0,
    date: isFinite(date) ? date : Date.now(),
  };
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
