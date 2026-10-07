import {$,esc,toast} from "./utils.js";
import {watchItems,watchRelationshipStartDate,saveRelationshipStartDate,addDiaryPost,updateDiaryPost,deleteDiaryPost,watchDiaryPosts,toggleDiaryLike,addDiaryComment,watchDiaryComments} from "./firestore.js";
import {APP_CONFIG} from "../config/app-config.js";

const diaryProfiles=[{id:APP_CONFIG.profiles.shazy.id,name:"Shazy"},{id:APP_CONFIG.profiles.kebyy.id,name:"Kebyy"}];
let stopPosts=null,stopDate=null,stopComments=new Map(),commentsByPost=new Map(),allPosts=[],startDate="",pageSize=4,driveToken="",driveTokenExpires=0,recorders=new Map(),photoUrls=new Map(),counterTimer=null;

export function renderHome(el,user,profile){
  disposeHome();
  pageSize=4;
  el.innerHTML=`<section class="couple-brand"><div class="brand-hearts">♡♡</div><h1>Keby &amp; Shazy</h1><p>TWO HEARTS <span>♥</span> ONE JOURNEY</p></section>
  <button id="together-counter" class="together-counter" type="button"><span class="counter-script">Together<br>Since ♡</span><span class="counter-main"><small>OUR RELATIONSHIP STARTED ON</small><strong id="counter-number">Set our special date</strong><div class="counter-units"><span><b id="count-days">0</b><small>Days</small></span><i></i><span><b id="count-hours">00</b><small>Hours</small></span><i></i><span><b id="count-minutes">00</b><small>Minutes</small></span><i></i><span><b id="count-seconds">00</b><small>Seconds</small></span></div><em id="counter-subtitle">Tap to add your anniversary</em></span></button>
  <div class="section-head"><div><p class="eyebrow">OUR SHARED WALL</p><h2>Little things, every day</h2></div><span class="tag">Just us two</span></div>
  <section class="shared-feed"><form class="diary-composer" data-composer="shared"><div class="feed-avatar">${esc(profile.name[0])}</div><textarea name="text" rows="3" maxlength="3000" placeholder="What would you like to share, ${esc(profile.name)}?" aria-label="Write a post"></textarea><div class="composer-actions"><label class="photo-select">＋ Photo<input type="file" name="photo" accept="image/*"></label><span class="selected-photo muted"></span><button class="primary" type="submit">Post</button></div><p class="drive-note">A private post for both of you ♡</p></form><div class="feed-posts" id="posts-shared"><p class="muted">Loading your little moments…</p></div><button class="secondary older-posts hidden" data-older="shared">Show older posts</button></section>
  <section class="hero dashboard-welcome"><p class="eyebrow">WELCOME BACK</p><h2>Our little world, ${esc(profile.name)} ♡</h2><p class="muted">A private space for memories, dreams and little moments.</p><div class="actions"><button class="primary" data-go="memories">Add a memory</button><button class="secondary" data-go="activities">Today's activity</button></div></section>
  <div class="section-head"><h3>Today</h3><span class="tag">${new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}</span></div><div class="grid"><div class="card"><h3>Question</h3><p id="dash-q">Loading…</p></div><div class="card"><h3>Challenge</h3><p id="dash-c">Loading…</p></div><div class="card"><h3>Our memories</h3><div class="stat" id="dash-count">♡</div><p class="muted">memories saved</p></div></div><div class="section-head"><h3>Latest memories</h3></div><div id="dash-memories" class="photo-grid"></div><button class="drawing-fab" type="button" aria-label="Open drawing canvas" title="Draw together">✎</button>`;

  watchItems("memory",items=>{$("#dash-count").textContent=items.length;$("#dash-memories").innerHTML=items.slice(0,6).filter(x=>x.photoUrl).map(x=>`<img src="${esc(x.photoUrl)}" alt="Memory">`).join("")||`<div class="card"><p class="muted">Your first memory can go here. ♡</p></div>`});
  $("#dash-q").textContent=APP_CONFIG.dailyQuestions[new Date().getDate()%APP_CONFIG.dailyQuestions.length];
  $("#dash-c").textContent=APP_CONFIG.starterChallenges[new Date().getDate()%APP_CONFIG.starterChallenges.length];
  el.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>window.App.navigate(b.dataset.go));
  el.querySelector(".drawing-fab").onclick=()=>window.App.navigate("drawing");

  $("#together-counter").onclick=async()=>{
    const date=prompt("When did your story begin? Enter the anniversary date as YYYY-MM-DD.",startDate);
    if(date===null)return;
    const [year,month,day]=date.split("-").map(Number),parsed=new Date(year,month-1,day);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.getFullYear()!==year||parsed.getMonth()!==month-1||parsed.getDate()!==day){toast("Please enter a valid date as YYYY-MM-DD.");return}
    try{await saveRelationshipStartDate(date)}catch(e){toast("Could not save your shared date. Check your connection and try again.")}
  };
  stopDate=watchRelationshipStartDate(date=>{startDate=date;renderCounter();clearInterval(counterTimer);if(startDate)counterTimer=setInterval(renderCounter,1000)});
  function renderCounter(){
    const number=$("#counter-number"),subtitle=$("#counter-subtitle"); if(!number||!subtitle)return;
    if(!startDate){number.textContent="Choose our date";subtitle.textContent="Tap to set the day our story began";["days","hours","minutes","seconds"].forEach(unit=>{const field=$("#count-"+unit);if(field)field.textContent=unit==="days"?"0":"00"});return}
    const [y,m,d]=startDate.split("-").map(Number),day=new Date(y,m-1,d);
    number.textContent=day.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});subtitle.textContent="Tap to change your special date";
    const elapsed=Math.max(0,Math.floor((Date.now()-day.getTime())/1000)),days=Math.floor(elapsed/86400),hours=Math.floor(elapsed%86400/3600),minutes=Math.floor(elapsed%3600/60),seconds=elapsed%60;
    $("#count-days").textContent=days.toLocaleString();$("#count-hours").textContent=String(hours).padStart(2,"0");$("#count-minutes").textContent=String(minutes).padStart(2,"0");$("#count-seconds").textContent=String(seconds).padStart(2,"0");
  }

  el.querySelectorAll(".diary-composer").forEach(form=>{
    const photo=form.elements.photo;
    photo.addEventListener("change",()=>{form.querySelector(".selected-photo").textContent=photo.files[0]?.name||""});
    form.addEventListener("submit",async e=>{
      e.preventDefault();const wallId=form.dataset.composer;
      const text=form.elements.text.value.trim();
      const file=photo.files[0];
      if(!text&&!file){toast("Write a note or add a photo first.");return}
      try{
        let photoData=null;
        if(file)photoData=await preparePhoto(file);
        await addDiaryPost({authorId:profile.id,authorName:profile.name,wallId:APP_CONFIG.coupleId,text,...(photoData||{})});
        form.reset();form.querySelector(".selected-photo").textContent="";toast("Your diary post is saved.");
      }catch(err){toast(err.message||"Could not save your post. Please try again.")}
    });
  });
  el.querySelectorAll("[data-older]").forEach(b=>b.onclick=()=>{pageSize+=4;renderPosts()});
  stopPosts=watchDiaryPosts(posts=>{allPosts=posts;renderPosts()});

  async function preparePhoto(file){
    if(!file.type.startsWith("image/"))throw new Error("Choose an image file.");
    if(file.size>8*1024*1024)throw new Error("Choose a photo under 8 MB.");
    const clientId=APP_CONFIG.googleDriveClientId;
    if(!clientId||clientId.startsWith("YOUR_"))throw new Error("Google Drive uploads need a Google OAuth client ID in config/app-config.js first.");
    if(!APP_CONFIG.googleDriveFolderId)throw new Error("Create a Google Drive folder shared with both accounts, then add its folder ID in config/app-config.js.");
    const token=await getDriveToken(clientId);
    const metadata={name:`Our Little World - ${file.name}`,mimeType:file.type};
    metadata.parents=[APP_CONFIG.googleDriveFolderId];
    const body=new FormData();body.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));body.append("file",file);
    const response=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink,mimeType",{method:"POST",headers:{Authorization:`Bearer ${token}`},body});
    if(!response.ok)throw new Error("Google Drive could not save that photo. Check Drive access and try again.");
    const saved=await response.json();
    return {photoDriveFileId:saved.id,photoUrl:saved.thumbnailLink||saved.webViewLink||"",photoName:saved.name};
  }
  function requestDriveToken(clientId){
    return new Promise((resolve,reject)=>{
      const start=()=>{
        if(!window.google?.accounts?.oauth2){reject(new Error("Google sign-in could not load. Refresh and try again."));return}
        const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/drive.file",callback:r=>r.access_token?resolve(r.access_token):reject(new Error("Google Drive access was not granted.")),error_callback:()=>reject(new Error("Google Drive sign-in was cancelled."))});
        client.requestAccessToken();
      };
      if(window.google?.accounts?.oauth2){start();return}
      const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.onload=start;script.onerror=()=>reject(new Error("Google sign-in could not load."));document.head.appendChild(script);
    });
  }
  async function getDriveToken(clientId){
    if(driveToken&&Date.now()<driveTokenExpires)return driveToken;
    driveToken=await requestDriveToken(clientId);driveTokenExpires=Date.now()+45*60*1000;return driveToken;
  }

  function renderPosts(){
    {
      const posts=allPosts,container=$("#posts-shared"),older=el.querySelector(`[data-older="shared"]`);
      if(!container)return;
      container.innerHTML=posts.slice(0,pageSize).map(p=>makePostMarkup(p,{name:p.authorName||"Us"})).join("")||`<div class="empty-diary"><span>♡</span><p>Your wall is waiting for a little moment.</p><small>Write something sweet or add a photo.</small></div>`;
      older.classList.toggle("hidden",posts.length<=pageSize);
      container.querySelectorAll("[data-like]").forEach(btn=>btn.onclick=async()=>{try{await toggleDiaryLike(btn.dataset.like,user.uid,(allPosts.find(p=>p.id===btn.dataset.like)?.likedBy||[]).includes(user.uid))}catch{toast("Could not update the like.")}});
      container.querySelectorAll("[data-reply]").forEach(btn=>btn.onclick=()=>showReply(btn.dataset.reply,btn.dataset.replyTo||""));
      container.querySelectorAll("[data-comment-form]").forEach(form=>form.onsubmit=async e=>{
        e.preventDefault();const postId=form.dataset.commentForm,text=form.elements.comment.value.trim();if(!text)return;
        try{await addDiaryComment(postId,{authorId:profile.id,authorName:profile.name,text,parentId:form.dataset.parentId||""});form.reset();form.dataset.parentId="";form.querySelector("button[type=submit]").textContent="Reply"}catch{toast("Could not save your comment.")}
      });
      container.querySelectorAll("[data-record]").forEach(btn=>btn.onclick=()=>recordVoice(btn.dataset.record,btn.closest(".comment-form")?.dataset.parentId||""));
      container.querySelectorAll("audio[data-audio]").forEach(audio=>audio.src=audio.dataset.audio);
      container.querySelectorAll("[data-load-photo]").forEach(btn=>btn.onclick=()=>loadDrivePhoto(btn.dataset.loadPhoto,btn));
      container.querySelectorAll("[data-edit-post]").forEach(btn=>btn.onclick=async()=>{const post=allPosts.find(p=>p.id===btn.dataset.editPost);if(!post)return;const text=prompt("Edit your post",post.text||"");if(text===null)return;try{await updateDiaryPost(post.id,{text:text.trim()});toast("Post updated.")}catch{toast("Could not update this post.")}});
      container.querySelectorAll("[data-delete-post]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Delete this post?"))return;try{await deleteDiaryPost(btn.dataset.deletePost);toast("Post deleted.")}catch{toast("Could not delete this post.")}});
    }
  }
  function showReply(postId,parentId){
    const form=el.querySelector(`[data-comment-form="${postId}"]`);if(!form)return;
    form.dataset.parentId=parentId;form.querySelector("button[type=submit]").textContent=parentId?"Send reply":"Comment";form.elements.comment.focus();
  }
  async function recordVoice(postId,parentId){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast("Voice recording is not available in this browser.");return}
    try{
      const existing=recorders.get(postId);
      if(existing){existing.recorder.stop();return}
      const stream=await navigator.mediaDevices.getUserMedia({audio:true}),recorder=new MediaRecorder(stream),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      recorder.onstop=async()=>{
        recorders.delete(postId);
        stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
        const button=el.querySelector(`[data-record="${postId}"]`);if(button){button.classList.remove("recording");button.title="Record voice reply"}
        if(blob.size>600000){toast("That recording is too large. Try a shorter voice reply.");return}
        const audioDataUrl=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});
        try{await addDiaryComment(postId,{authorId:profile.id,authorName:profile.name,text:"",parentId,audioDataUrl});toast("Voice reply saved.")}catch{toast("Could not save your voice reply.")}
      };
      recorder.start();recorders.set(postId,{recorder,stream});toast("Recording. Tap the microphone again to finish.");
      const button=el.querySelector(`[data-record="${postId}"]`);if(button){button.classList.add("recording");button.title="Stop recording"}
    }catch{toast("Allow microphone access to record a voice reply.")}
  }
  async function loadDrivePhoto(fileId,button){
    try{
      if(!APP_CONFIG.googleDriveClientId||APP_CONFIG.googleDriveClientId.startsWith("YOUR_"))throw new Error("Google Drive is not connected yet.");
      const token=await getDriveToken(APP_CONFIG.googleDriveClientId);
      const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error("Could not open this photo. Make sure its shared folder includes both accounts.");
      const url=URL.createObjectURL(await response.blob());photoUrls.set(fileId,url);
      const wrap=button.closest(".drive-photo");wrap.innerHTML=`<img src="${url}" alt="Photo in shared Google Drive" loading="lazy"><a class="photo-open" href="https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view" target="_blank" rel="noopener">Open photo in Drive ↗</a>`;
    }catch(e){toast(e.message||"Could not load the photo from Google Drive.")}
  }
  function makePostMarkup(post,wall){
    const liked=(post.likedBy||[]).includes(user.uid);let stop=stopComments.get(post.id);
    if(!stop){stop=watchDiaryComments(post.id,comments=>{commentsByPost.set(post.id,comments);const target=$(`#comments-${post.id}`);if(target){target.innerHTML=commentMarkup(comments,post.id);target.querySelectorAll("[data-reply]").forEach(b=>b.onclick=()=>showReply(post.id,b.dataset.replyTo||""));target.querySelectorAll("audio[data-audio]").forEach(a=>a.src=a.dataset.audio)}});stopComments.set(post.id,stop)}
    const time=post.createdAt?.toDate?post.createdAt.toDate().toLocaleString("en",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Just now";
    const photo=post.photoDriveFileId?(photoUrls.has(post.photoDriveFileId)?`<img src="${photoUrls.get(post.photoDriveFileId)}" alt="Photo in shared Google Drive" loading="lazy">`:`<button class="load-photo" type="button" data-load-photo="${esc(post.photoDriveFileId)}">Load photo from Drive</button>`):"";
    const own=post.authorId===profile.id;
    return `<article class="diary-post" id="post-${post.id}"><div class="post-author"><div class="diary-avatar small">${esc((post.authorName||wall.name)[0])}</div><div><strong>${esc(post.authorName||wall.name)}</strong><small>${time}${post.updatedAt?" · edited":""}</small></div>${own?`<div class="post-menu"><button class="text-button" data-edit-post="${post.id}">Edit</button><button class="text-button" data-delete-post="${post.id}">Delete</button></div>`:""}</div><div class="post-content">${post.text?`<p><a class="post-anchor" href="#post-${post.id}">${esc(post.text).replace(/\n/g,"<br>")}</a></p>`:""}${post.photoDriveFileId?`<div class="drive-photo">${photo}<a class="photo-open" href="https://drive.google.com/file/d/${encodeURIComponent(post.photoDriveFileId)}/view" target="_blank" rel="noopener">Open photo in Drive ↗</a></div>`:""}</div><div class="post-actions"><button class="text-button ${liked?"liked":""}" data-like="${post.id}">♡ ${liked?"Liked":"Like"} · ${(post.likedBy||[]).length}</button><button class="text-button" data-reply="${post.id}">Comment</button></div><div class="comment-list" id="comments-${post.id}">${commentMarkup(commentsByPost.get(post.id)||[],post.id)}</div><form class="comment-form" data-comment-form="${post.id}"><input name="comment" maxlength="1000" placeholder="Write a comment or reply…" aria-label="Write a comment"><button class="secondary" type="submit">Comment</button><button class="voice-btn" data-record="${post.id}" type="button" title="Record voice reply">🎙</button></form></article>`;
  }
  function commentMarkup(comments,postId,parentId="",depth=0){
    return comments.filter(c=>(c.parentId||"")===parentId).map(c=>`<div class="comment ${depth?"comment-reply":""}"><strong>${esc(c.authorName||"Us")}</strong>${c.text?`<span>${esc(c.text).replace(/\n/g,"<br>")}</span>`:""}${c.audioDataUrl?`<audio controls data-audio="${c.audioDataUrl}"></audio>`:""}<button class="text-button" data-reply="${postId}" data-reply-to="${c.id}">Reply</button>${commentMarkup(comments,postId,c.id,depth+1)}</div>`).join("");
  }
}

export function disposeHome(){
  stopPosts?.();stopPosts=null;stopDate?.();stopDate=null;
  clearInterval(counterTimer);counterTimer=null;
  stopComments.forEach(stop=>stop());stopComments.clear();commentsByPost.clear();
  for(const {recorder,stream} of recorders.values()){
    if(recorder.state!=="inactive")recorder.stop();
    stream.getTracks().forEach(track=>track.stop());
  }
  recorders.clear();photoUrls.forEach(url=>URL.revokeObjectURL(url));photoUrls.clear();
}
