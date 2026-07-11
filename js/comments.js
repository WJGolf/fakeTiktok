// ---- Comments bottom sheet ----

import { session, myProfile } from './state.js';
import { fetchComments, insertComment, deleteCommentApi } from './api.js';
import { escapeHtml, timeAgo, trashIcon } from './helpers.js';

var currentVideoId = null;
var _openLoginCb = null;

export function setCommentsCallbacks(openLogin) {
  _openLoginCb = openLogin;
}

export function openComments(videoId) {
  currentVideoId = videoId;
  var overlay = document.getElementById('commentOverlay');
  overlay.classList.add('show');

  // แสดง/ซ่อน input ตาม login state
  var inputRow  = document.getElementById('commentInputRow');
  var loginNote = document.getElementById('commentLoginNote');
  if (session && myProfile) {
    inputRow.style.display  = 'flex';
    loginNote.style.display = 'none';
  } else {
    inputRow.style.display  = 'none';
    loginNote.style.display = 'block';
  }

  loadComments();
}

export function closeComments() {
  document.getElementById('commentOverlay').classList.remove('show');
  currentVideoId = null;
}

function loadComments() {
  var list = document.getElementById('commentList');
  list.innerHTML = '<div class="comment-empty">กำลังโหลด...</div>';

  fetchComments(currentVideoId).then(function(comments) {
    if (!comments || !comments.length) {
      list.innerHTML = '<div class="comment-empty">ยังไม่มีคอมเมนต์ เป็นคนแรกที่แสดงความคิดเห็น!</div>';
      return;
    }
    list.innerHTML = '';
    comments.forEach(function(c) {
      list.appendChild(createCommentEl(c));
    });
    list.scrollTop = list.scrollHeight;
  }).catch(function() {
    list.innerHTML = '<div class="comment-empty">โหลดคอมเมนต์ไม่สำเร็จ</div>';
  });
}

function createCommentEl(c) {
  var item = document.createElement('div');
  item.className = 'comment-item';

  var avatarHtml = escapeHtml((c.author || '?').charAt(0).toUpperCase());

  var canDelete = session && session.user && session.user.id === c.user_id;
  var delHtml = canDelete
    ? '<button class="c-del" data-id="' + c.id + '" title="ลบ">' + trashIcon() + '</button>'
    : '';

  item.innerHTML =
    '<div class="c-avatar">' + avatarHtml + '</div>' +
    '<div class="c-body">' +
      '<div class="c-name">' + escapeHtml(c.author) + '</div>' +
      '<div class="c-text">' + escapeHtml(c.content) + '</div>' +
      '<div class="c-time">' + timeAgo(c.created_at) + '</div>' +
    '</div>' + delHtml;

  if (canDelete) {
    item.querySelector('.c-del').onclick = function() {
      if (!confirm('ลบคอมเมนต์นี้?')) return;
      deleteCommentApi(c.id).then(function() { loadComments(); });
    };
  }
  return item;
}

export function sendComment() {
  if (!session || !myProfile || !currentVideoId) return;
  var input = document.getElementById('commentInput');
  var text = input.value.trim();
  if (!text) return;

  var sendBtn = document.getElementById('commentSend');
  sendBtn.disabled = true;
  input.value = '';

  insertComment(currentVideoId, session.user.id, myProfile.username, text)
    .then(function() { loadComments(); })
    .catch(function(e) { alert(e.message); })
    .finally(function() { sendBtn.disabled = false; });
}

// ---- event binding (เรียกจาก app.js) ----
export function bindCommentEvents() {
  document.getElementById('commentClose').onclick = closeComments;
  document.getElementById('commentSend').onclick = sendComment;
  document.getElementById('commentInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); sendComment(); }
  });
  document.getElementById('commentLoginLink').onclick = function() {
    closeComments();
    if (_openLoginCb) _openLoginCb();
  };
  // ปิดเมื่อคลิกพื้นหลัง
  document.getElementById('commentOverlay').onclick = function(e) {
    if (e.target === this) closeComments();
  };
}
