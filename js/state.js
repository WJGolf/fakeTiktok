// ---- Shared mutable state ----
// ES modules export live bindings ดังนั้นโมดูลอื่นจะเห็นค่าที่เปลี่ยนผ่าน setter ได้ทันที

export let session = null;        // { access_token, refresh_token, user }
export let myProfile = null;      // { id, username, avatar_url, bio }
export let videos = [];
export let observer = null;
export let newVideoPollTimer = null;
export const profileCache = {};   // id → profile object
export const likedIds = new Set();

// ---- Setters ----
export function setSession(s)           { session = s; }
export function setMyProfile(p)         { myProfile = p; }
export function setVideos(v)            { videos = v; }
export function setObserver(o)          { observer = o; }
export function setNewVideoPollTimer(t) { newVideoPollTimer = t; }
