// ---- Main entry point ----
// เชื่อมทุกโมดูลเข้าด้วยกัน, ผูก event listeners, แล้วเริ่มแอป

import { session, myProfile } from './state.js';
import { initSession, doLogin, doSignup, renderAuthUI } from './auth.js';
import { fetchVideos, setFeedCallbacks, scrollFeedTop } from './feed.js';
import { openComments, bindCommentEvents, setCommentsCallbacks } from './comments.js';
import { openUpload, bindUploadEvents, setUploadCallbacks } from './upload.js';
import { openProfile, closeProfile, bindProfileEvents, setProfileCallbacks } from './profile.js';

// ---- helper: go home ----
function goHome() {
  closeProfile();
  scrollFeedTop();
}

// ---- wire up inter-module callbacks ----
setFeedCallbacks(openUpload, openProfile, openComments);
setCommentsCallbacks(openLogin);
setUploadCallbacks(openLogin);
setProfileCallbacks(goHome);

// ---- overlay helpers ----
function openLogin() {
  document.getElementById('liEmail').value   = '';
  document.getElementById('liPass').value    = '';
  document.getElementById('liErr').textContent = '';
  document.getElementById('loginOverlay').classList.add('show');
}

function closeLogin() {
  document.getElementById('loginOverlay').classList.remove('show');
}

function openSignup() {
  document.getElementById('suUsername').value  = '';
  document.getElementById('suEmail').value    = '';
  document.getElementById('suPass').value     = '';
  document.getElementById('suErr').textContent = '';
  document.getElementById('suOk').textContent  = '';
  document.getElementById('signupOverlay').classList.add('show');
}

function closeSignup() {
  document.getElementById('signupOverlay').classList.remove('show');
}

// ---- login events ----
document.getElementById('loginBtn').onclick = openLogin;
document.getElementById('loginCancel').onclick = closeLogin;
document.getElementById('loginOverlay').onclick = function(e) { if (e.target === this) closeLogin(); };
document.getElementById('goSignup').onclick = function() { closeLogin(); openSignup(); };

document.getElementById('liSubmit').onclick = function() {
  var email = document.getElementById('liEmail').value.trim();
  var pass  = document.getElementById('liPass').value;
  var errEl = document.getElementById('liErr');
  if (!email || !pass) { errEl.textContent = 'กรุณากรอกให้ครบ'; return; }
  var btn = this;
  btn.disabled = true;
  errEl.textContent = '';
  doLogin(email, pass).then(function() {
    closeLogin();
    fetchVideos();
  }).catch(function(e) {
    errEl.textContent = e.message;
  }).finally(function() { btn.disabled = false; });
};

// ---- signup events ----
document.getElementById('signupCancel').onclick = closeSignup;
document.getElementById('signupOverlay').onclick = function(e) { if (e.target === this) closeSignup(); };
document.getElementById('goLogin').onclick = function() { closeSignup(); openLogin(); };

document.getElementById('suSubmit').onclick = function() {
  var username = document.getElementById('suUsername').value.trim();
  var email    = document.getElementById('suEmail').value.trim();
  var pass     = document.getElementById('suPass').value;
  var errEl    = document.getElementById('suErr');
  var okEl     = document.getElementById('suOk');
  if (!username || !email || !pass) { errEl.textContent = 'กรุณากรอกให้ครบทุกช่อง'; return; }
  if (pass.length < 6) { errEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'; return; }
  var btn = this;
  btn.disabled = true;
  errEl.textContent = '';
  okEl.textContent  = '';
  doSignup(email, pass, username).then(function(result) {
    if (result.autoLogin) {
      closeSignup();
      fetchVideos();
    } else {
      okEl.textContent = 'สมัครสำเร็จ! กรุณาเช็คอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ';
    }
  }).catch(function(e) {
    errEl.textContent = e.message;
  }).finally(function() { btn.disabled = false; });
};

// ---- topbar buttons ----
document.getElementById('logoHome').onclick = goHome;
document.getElementById('uploadBtn').onclick = openUpload;
document.getElementById('myAvatarBtn').onclick = function() {
  if (session && session.user) openProfile(session.user.id);
};

// ---- bind sub-module events ----
bindCommentEvents();
bindUploadEvents();
bindProfileEvents();

// ---- start app ----
initSession().then(function() {
  fetchVideos();
});
