// ---- Authentication: login, signup, session management ----

import { SESSION_KEY } from './config.js';
import { session, myProfile, setSession, setMyProfile, profileCache } from './state.js';
import { signUp, signIn, signOutRequest, ensureProfile, fetchProfileById } from './api.js';
import { escapeHtml } from './helpers.js';

// ---- session persistence ----
export function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (raw) setSession(JSON.parse(raw));
  } catch (e) { setSession(null); }
}

export function saveSession(s) {
  setSession(s);
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else   localStorage.removeItem(SESSION_KEY);
}

// ---- UI: แสดงปุ่มตาม login state ----
export function renderAuthUI() {
  var loginBtn  = document.getElementById('loginBtn');
  var avatarBtn = document.getElementById('myAvatarBtn');
  if (session && myProfile) {
    loginBtn.style.display  = 'none';
    avatarBtn.style.display = 'flex';
    avatarBtn.innerHTML = myProfile.avatar_url
      ? '<img src="' + myProfile.avatar_url + '">'
      : escapeHtml((myProfile.username || '?').charAt(0).toUpperCase());
  } else {
    loginBtn.style.display  = 'inline-block';
    avatarBtn.style.display = 'none';
  }
}

// ---- init: โหลด session เก่าตอนเปิดเว็บ ----
export function initSession() {
  loadSession();
  if (!session) { renderAuthUI(); return Promise.resolve(); }
  return ensureProfile(session.user).then(function(p) {
    setMyProfile(p);
    profileCache[session.user.id] = p;
    renderAuthUI();
  }).catch(function() {
    saveSession(null);
    setMyProfile(null);
    renderAuthUI();
  });
}

// ---- login ----
export function doLogin(email, pass) {
  return signIn(email, pass).then(function(d) {
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, user: d.user });
    return ensureProfile(d.user).then(function(p) {
      setMyProfile(p);
      profileCache[d.user.id] = p;
      renderAuthUI();
    });
  });
}

// ---- signup ----
export function doSignup(email, pass, username) {
  return signUp(email, pass, username).then(function(d) {
    // ถ้ามี access_token แปลว่าล็อกอินให้อัตโนมัติ (confirm email ปิดอยู่)
    if (d.access_token) {
      saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, user: d.user });
      return ensureProfile(d.user, username).then(function(p) {
        setMyProfile(p);
        profileCache[d.user.id] = p;
        renderAuthUI();
        return { autoLogin: true };
      });
    }
    // ต้องยืนยันอีเมลก่อน
    return { autoLogin: false };
  });
}

// ---- logout ----
export function doSignOut(goHomeFn) {
  return signOutRequest().then(function() {
    saveSession(null);
    setMyProfile(null);
    renderAuthUI();
    if (goHomeFn) goHomeFn();
  });
}
