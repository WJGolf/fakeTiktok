// ---- Supabase REST / Storage / Auth API helpers ----
// ไม่ต้องใช้ SDK — เรียก REST API ตรงๆ ผ่าน fetch

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { session, setSession, profileCache } from './state.js';
import { SESSION_KEY } from './config.js';

// ---- headers ----
function headers(extra) {
  var h = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + (session ? session.access_token : SUPABASE_KEY)
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

export function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY &&
    SUPABASE_URL.indexOf('YOUR-PROJECT-REF') === -1 &&
    SUPABASE_KEY.indexOf('YOUR-ANON-PUBLIC-KEY') === -1);
}

// ---- token refresh ----
function refreshSession() {
  if (!session || !session.refresh_token) return Promise.reject(new Error('no session'));
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.access_token) {
      var s = { access_token: d.access_token, refresh_token: d.refresh_token, user: d.user || (session && session.user) };
      setSession(s);
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } else {
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
    }
  })
  .catch(function() { setSession(null); localStorage.removeItem(SESSION_KEY); });
}

// ---- generic authenticated fetch ----
export function authFetch(path, opts, retried) {
  opts = opts || {};
  opts.headers = Object.assign(
    headers(opts.jsonBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
    opts.headers || {}
  );
  if (opts.jsonBody !== undefined) { opts.body = JSON.stringify(opts.jsonBody); delete opts.jsonBody; }
  return fetch(SUPABASE_URL + path, opts).then(function(r) {
    if (r.status === 401 && session && session.refresh_token && !retried) {
      return refreshSession().then(function() { return authFetch(path, opts, true); });
    }
    return r;
  });
}

// ---- แปล error ภาษาไทย ----
export function authErrorMessage(r, d) {
  if (r.status === 429) {
    var retry = r.headers.get('Retry-After');
    return 'ตอนนี้มีคนใช้งานพร้อมกันเยอะ ระบบจำกัดจำนวนคำขอชั่วคราว กรุณาลองใหม่' +
      (retry ? ' ในอีก ' + retry + ' วินาที' : 'อีกครั้งในอีกสักครู่');
  }
  var code = (d && (d.error_code || d.code)) || '';
  var msg  = (d && (d.msg || d.error_description || d.message)) || '';
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg))
    return 'ส่งอีเมลถี่เกินไป กรุณารอสักครู่แล้วลองสมัครใหม่ (หรือแจ้งผู้ดูแลให้ปิดการยืนยันอีเมล)';
  if (code === 'user_already_exists' || /already registered/i.test(msg))
    return 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg))
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code === 'over_request_rate_limit' || /rate limit/i.test(msg))
    return 'มีคำขอเข้ามาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  return msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

// ---- Auth endpoints ----
export function signUp(email, pass, username) {
  return fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: pass, data: { username: username } })
  }).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(authErrorMessage(r, d)); return d; }); });
}

export function signIn(email, pass) {
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: pass })
  }).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(authErrorMessage(r, d)); return d; }); });
}

export function signOutRequest() {
  if (!session) return Promise.resolve();
  return fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: headers() }).catch(function() {});
}

// ---- Profile APIs ----
export function fetchProfileById(id) {
  if (profileCache[id]) return Promise.resolve(profileCache[id]);
  return authFetch('/rest/v1/profiles?select=*&id=eq.' + id, { method: 'GET' })
    .then(function(r) { return r.json(); })
    .then(function(rows) { var p = rows && rows[0]; if (p) profileCache[id] = p; return p; });
}

export function upsertMyProfile(userId, fields) {
  return authFetch('/rest/v1/profiles?id=eq.' + userId, {
    method: 'PATCH', jsonBody: fields, headers: { 'Prefer': 'return=representation' }
  }).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error((d && d.message) || 'บันทึกไม่สำเร็จ'); return d[0]; }); });
}

export function ensureProfile(user, fallbackUsername) {
  return fetchProfileById(user.id).then(function(p) {
    if (p) return p;
    var username = fallbackUsername || (user.user_metadata && user.user_metadata.username) || (user.email ? user.email.split('@')[0] : 'ผู้ใช้');
    return authFetch('/rest/v1/profiles', {
      method: 'POST',
      jsonBody: { id: user.id, username: username, bio: '', avatar_url: null },
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' }
    }).then(function(r) {
      return r.json().then(function(d) {
        if (!r.ok) throw new Error((d && d.message) || 'สร้างโปรไฟล์ไม่สำเร็จ');
        var created = Array.isArray(d) ? d[0] : d;
        profileCache[user.id] = created;
        return created;
      });
    });
  });
}

// ---- Video APIs ----
export function fetchVideosData() {
  return authFetch('/rest/v1/videos?select=*&order=created_at.desc', { method: 'GET' })
    .then(function(r) { if (!r.ok) throw new Error('โหลดฟีดไม่สำเร็จ (' + r.status + ')'); return r.json(); });
}

export function fetchLatestVideo() {
  return fetch(SUPABASE_URL + '/rest/v1/videos?select=id,created_at&order=created_at.desc&limit=1', { headers: headers() })
    .then(function(r) { return r.ok ? r.json() : []; });
}

export function insertVideoRow(row) {
  return authFetch('/rest/v1/videos', {
    method: 'POST', jsonBody: row, headers: { 'Prefer': 'return=representation' }
  }).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error((d && d.message) || 'บันทึกข้อมูลไม่สำเร็จ'); return d; }); });
}

export function deleteVideoRow(id) {
  return authFetch('/rest/v1/videos?id=eq.' + id, { method: 'DELETE' });
}

export function fetchUserVideos(userId) {
  return authFetch('/rest/v1/videos?select=*&user_id=eq.' + userId + '&order=created_at.desc', { method: 'GET' })
    .then(function(r) { return r.json(); });
}

export function incrementLikes(id) {
  return authFetch('/rest/v1/rpc/increment_likes', { method: 'POST', jsonBody: { video_id: id } });
}

// ---- Storage upload ----
export function uploadFile(file, prefix) {
  var safeName = (prefix || '') + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  return authFetch('/storage/v1/object/videos/' + safeName, {
    method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(t || ('อัปโหลดไฟล์ไม่สำเร็จ (' + r.status + ')')); });
    return SUPABASE_URL + '/storage/v1/object/public/videos/' + safeName;
  });
}

// ---- Comment APIs ----
export function fetchComments(videoId) {
  return authFetch('/rest/v1/comments?select=*&video_id=eq.' + videoId + '&order=created_at.asc', { method: 'GET' })
    .then(function(r) { return r.json(); });
}

export function insertComment(videoId, userId, author, content) {
  return authFetch('/rest/v1/comments', {
    method: 'POST',
    jsonBody: { video_id: videoId, user_id: userId, author: author, content: content },
    headers: { 'Prefer': 'return=representation' }
  }).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error((d && d.message) || 'ส่งคอมเมนต์ไม่สำเร็จ'); return d[0]; }); });
}

export function deleteCommentApi(id) {
  return authFetch('/rest/v1/comments?id=eq.' + id, { method: 'DELETE' });
}

export function countComments(videoId) {
  return authFetch('/rest/v1/comments?select=id&video_id=eq.' + videoId, {
    method: 'GET', headers: { 'Prefer': 'count=exact', 'Range': '0-0' }
  }).then(function(r) {
    var range = r.headers.get('content-range') || '';
    var total = parseInt(range.split('/')[1], 10);
    return isNaN(total) ? 0 : total;
  }).catch(function() { return 0; });
}
