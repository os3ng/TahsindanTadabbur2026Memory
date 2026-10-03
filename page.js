let currentUser = null;
let uploaded = [];
let memories = [];

const carousel = document.getElementById("carousel");
const gallery = document.getElementById("gallery");
const carouselEmpty = document.getElementById("carouselEmpty");
const galleryEmpty = document.getElementById("galleryEmpty");
const carouselHint = document.getElementById("carouselHint");
const form = document.getElementById("memoryForm");
const photo = document.getElementById("photo");
const statusEl = document.getElementById("status");
let x=0, paused=false, speed=.55, raf;

function esc(s=""){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function card(m,i){
  const tilt=((i%5)-2)*.35;
  const isMine = !!currentUser && !!m.owner_id && m.owner_id === currentUser.id;
  const removeButton = isMine
    ? `<button class="remove-memory" type="button" data-memory-id="${esc(m.id)}" data-photo-path="${esc(m.photo_path || "")}" aria-label="Delete photo: ${esc(m.name)}" title="Delete your photo"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14m-7 4v7m4-7v7"/></svg></button>`
    : "";

  return `<article class="memory-card" style="--tilt:${tilt}deg">
    ${removeButton}
    <img src="${esc(m.image)}" alt="${esc(m.description||m.name)}" loading="lazy">
    <div class="card-meta">
      <h3>${esc(m.name)}</h3>
      ${m.description?`<p>${esc(m.description)}</p>`:""}
      ${m.date?`<small>${esc(m.date)}</small>`:""}

      <div class="card-social compact-social">
        <button type="button" class="card-like" data-like-memory="${esc(m.id)}" aria-label="Like memory">♡ <span data-like-count="${esc(m.id)}">0</span></button>
        <span class="comment-count-label">💬 <span data-comment-count="${esc(m.id)}">0</span></span>
      </div>

      <div class="direct-comments" data-comments-for="${esc(m.id)}">
        <p class="direct-comments-empty">No comments yet.</p>
      </div>

      <form class="quick-comment-form" data-quick-comment="${esc(m.id)}">
        <input class="quick-comment-input" maxlength="300" required placeholder="Write a comment..." autocomplete="off">
        <button class="quick-comment-send" type="submit" aria-label="Send comment">➤</button>
      </form>
      <small class="quick-comment-status" data-comment-status="${esc(m.id)}" aria-live="polite"></small>
    </div>
  </article>`;
}

function render(){
  memories=[...uploaded];
  const hasMemories=memories.length>0;
  if(carouselEmpty) carouselEmpty.hidden=hasMemories;
  if(galleryEmpty) galleryEmpty.hidden=hasMemories;
  if(carouselHint) carouselHint.hidden=!hasMemories;

  if(!hasMemories){
    if(carousel) carousel.innerHTML="";
    if(gallery) gallery.innerHTML="";
    x=0;
    return;
  }

  const set=memories.map((memory,index)=>card(memory,index)).join("");
  // Duplicate only real uploaded memories to create the seamless infinite track.
  if(carousel){
    carousel.innerHTML=set+set;
    carousel.style.transform="translate3d(0,0,0)";
  }
  if(gallery) gallery.innerHTML=set;
  x=0;
}

function animate(){
  if(!carousel) return;
  if(!paused && memories.length){
    x-=speed;
    const half=carousel.scrollWidth/2;
    if(half>0 && Math.abs(x)>=half) x+=half;
    carousel.style.transform=`translate3d(${x}px,0,0)`;
  }
  raf=requestAnimationFrame(animate);
}

carousel?.addEventListener("mouseenter",()=>paused=true);
carousel?.addEventListener("mouseleave",()=>paused=false);
const toggleButton=document.getElementById("toggle");
if(toggleButton) toggleButton.onclick=e=>{paused=!paused;e.target.textContent=paused?"Play":"Pause"};
const prevButton=document.getElementById("prev");
if(prevButton) prevButton.onclick=()=>{if(memories.length)x+=330};
const nextButton=document.getElementById("next");
if(nextButton) nextButton.onclick=()=>{if(memories.length)x-=330};

if(photo) photo.onchange=()=>document.getElementById("fileName").textContent=photo.files[0]?.name||"No photo selected";

async function ensureUser(){
  const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
  if(sessionError) throw sessionError;
  if(session?.user){currentUser=session.user;return currentUser;}
  const {data,error}=await supabaseClient.auth.signInAnonymously();
  if(error) throw error;
  currentUser=data.user;
  return currentUser;
}

async function loadMemories({silent=false}={}){
  if(!silent && statusEl) statusEl.textContent="Loading shared memories…";
  const {data,error}=await supabaseClient
    .from("memories")
    .select("id, owner_id, name, description, memory_date, photo_path, photo_url, created_at")
    .order("created_at",{ascending:false});
  if(error) throw error;
  uploaded=(data||[]).map(m=>({...m,date:m.memory_date || "",image:m.photo_url}));
  render();
  await loadSocialSummary().catch(console.error);
  if(!silent && statusEl) statusEl.textContent="";
}

function safeExtension(file){
  const raw=(file.name.split(".").pop()||"").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(raw)?raw:"jpg";
}

if(form) form.onsubmit=async e=>{
  e.preventDefault();
  const file=photo.files[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){statusEl.textContent="Please choose an image file.";return;}
  if(file.size>5*1024*1024){statusEl.textContent="Please use a photo smaller than 5 MB.";return;}

  const submitBtn=form.querySelector('button[type="submit"]');
  submitBtn.disabled=true;
  submitBtn.textContent="Uploading…";
  statusEl.textContent="Uploading your memory…";

  let path="";
  try{
    await ensureUser();
    const extension=safeExtension(file);
    path=`${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const {error:uploadError}=await supabaseClient.storage
      .from("memories")
      .upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
    if(uploadError) throw uploadError;

    const {data:publicData}=supabaseClient.storage.from("memories").getPublicUrl(path);
    const publicUrl=publicData.publicUrl;

    const payload={
      owner_id:currentUser.id,
      name:document.getElementById("name").value.trim(),
      description:document.getElementById("description").value.trim() || null,
      memory_date:document.getElementById("date").value || null,
      photo_path:path,
      photo_url:publicUrl
    };

    const {error:dbError}=await supabaseClient.from("memories").insert(payload);
    if(dbError){await supabaseClient.storage.from("memories").remove([path]);throw dbError;}

    form.reset();
    document.getElementById("fileName").textContent="No photo selected";
    await loadMemories({silent:true});
    statusEl.textContent="Memory added — it is now part of the carousel!";
    document.getElementById("memories").scrollIntoView({behavior:"smooth"});
  }catch(err){
    console.error(err);
    statusEl.textContent=`Upload failed: ${err.message || "Please try again."}`;
  }finally{
    submitBtn.disabled=false;
    submitBtn.textContent="Add Memory";
  }
};

async function removeUploadedPhoto(e){
  const button=e.target.closest("[data-memory-id]");
  if(!button)return;
  const id=button.dataset.memoryId;
  const photoPath=button.dataset.photoPath;
  const memory=uploaded.find(m=>String(m.id)===String(id));
  if(!memory || !currentUser || memory.owner_id!==currentUser.id){
    statusEl.textContent="You can only delete photos that you uploaded on this device/session.";
    return;
  }
  if(!confirm("Remove this memory? This will permanently delete the photo and description."))return;

  button.disabled=true;
  statusEl.textContent="Deleting your memory…";
  try{
    if(photoPath){
      const {error:storageError}=await supabaseClient.storage.from("memories").remove([photoPath]);
      if(storageError) throw storageError;
    }
    const {error:dbError}=await supabaseClient.from("memories").delete().eq("id",id);
    if(dbError) throw dbError;
    await loadMemories({silent:true});
    statusEl.textContent="Memory removed. You can upload the correct photo anytime.";
  }catch(err){
    console.error(err);
    statusEl.textContent=`Delete failed: ${err.message || "Please try again."}`;
    button.disabled=false;
  }
}

gallery?.addEventListener("click",removeUploadedPhoto);
carousel?.addEventListener("click",removeUploadedPhoto);

async function startApp(){
  render();
  if(carousel) animate();
  try{
    if(statusEl) statusEl.textContent="Connecting to shared memories…";
    await ensureUser();
    await loadMemories();
  }catch(err){
    console.error(err);
    if(statusEl) statusEl.textContent=`Could not connect to Supabase: ${err.message || "Check setup.sql and Anonymous Sign-Ins."}`;
  }

  setInterval(()=>loadMemories({silent:true}).catch(console.error),20000);
}

startApp();



/* ---------- Likes + card counts ---------- */
let socialSummary={};

async function loadSocialSummary(){
  if(!memories.length)return;
  const ids=memories.map(m=>m.id);
  const [{data:commentsData,error:commentsError},{data:likesData,error:likesError}]=await Promise.all([
    supabaseClient.from("comments").select("id,memory_id").in("memory_id",ids),
    supabaseClient.from("memory_likes").select("id,memory_id,owner_id").in("memory_id",ids)
  ]);
  if(commentsError)console.error(commentsError);
  if(likesError)console.error(likesError);
  socialSummary={};
  ids.forEach(id=>socialSummary[id]={comments:0,likes:0,likedByMe:false});
  (commentsData||[]).forEach(c=>{if(socialSummary[c.memory_id])socialSummary[c.memory_id].comments++;});
  (likesData||[]).forEach(l=>{if(socialSummary[l.memory_id]){socialSummary[l.memory_id].likes++;if(currentUser&&l.owner_id===currentUser.id)socialSummary[l.memory_id].likedByMe=true;}});
  ids.forEach(id=>{
    document.querySelectorAll(`[data-comment-count="${CSS.escape(id)}"]`).forEach(el=>el.textContent=socialSummary[id]?.comments||0);
    document.querySelectorAll(`[data-like-count="${CSS.escape(id)}"]`).forEach(el=>el.textContent=socialSummary[id]?.likes||0);
    document.querySelectorAll(`[data-like-memory="${CSS.escape(id)}"]`).forEach(btn=>{
      btn.classList.toggle("liked",!!socialSummary[id]?.likedByMe);
      const count=socialSummary[id]?.likes||0;
      btn.innerHTML=`${socialSummary[id]?.likedByMe?"♥":"♡"} <span data-like-count="${id}">${count}</span>`;
    });
  });
}

document.addEventListener("click",async e=>{
  const likeBtn=e.target.closest("[data-like-memory]");
  if(!likeBtn)return;
  e.preventDefault();
  e.stopPropagation();
  const memoryId=likeBtn.dataset.likeMemory;
  try{
    await ensureUser();
    const liked=!!socialSummary[memoryId]?.likedByMe;
    if(liked){
      const {error}=await supabaseClient.from("memory_likes").delete().eq("memory_id",memoryId).eq("owner_id",currentUser.id);
      if(error)throw error;
    }else{
      const {error}=await supabaseClient.from("memory_likes").insert({memory_id:memoryId,owner_id:currentUser.id});
      if(error)throw error;
    }
    await loadSocialSummary();
  }catch(err){console.error(err);}
});

/* ---------- Persistent shell navigation ---------- */
document.addEventListener("click", e=>{
  const link=e.target.closest("[data-shell-nav]");
  if(!link) return;
  if(window.parent===window) return;
  e.preventDefault();
  const action=link.dataset.shellNav;
  window.parent.postMessage({type:"shell-nav",action}, "*");
});



/* ---------- Direct comments under each photo ---------- */
let commentsByMemory={};

function formatCommentTime(value){
  try{
    const d=new Date(value);
    return d.toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  }catch(e){return "";}
}

function renderDirectComments(memoryId){
  const comments=commentsByMemory[memoryId]||[];
  document.querySelectorAll(`[data-comments-for="${CSS.escape(memoryId)}"]`).forEach(box=>{
    if(!comments.length){
      box.innerHTML='<p class="direct-comments-empty">No comments yet.</p>';
      return;
    }
    box.innerHTML=comments.map(c=>{
      const mine=!!currentUser && c.owner_id===currentUser.id;
      return `<div class="direct-comment" data-direct-comment-row="${esc(c.id)}">
        <div class="direct-comment-bubble">
          <div class="direct-comment-top">
            <strong>${mine?"You":"Guest"}</strong>
            <small>${esc(formatCommentTime(c.created_at))}</small>
          </div>
          <p data-direct-comment-text="${esc(c.id)}">${esc(c.comment_text)}</p>
          ${mine?`<div class="direct-comment-actions"><button type="button" data-edit-direct-comment="${esc(c.id)}" data-memory="${esc(memoryId)}">Edit</button><button type="button" data-delete-direct-comment="${esc(c.id)}" data-memory="${esc(memoryId)}">Delete</button></div>`:""}
        </div>
      </div>`;
    }).join("");
    box.scrollTop=box.scrollHeight;
  });
}

async function loadAllComments(){
  if(!memories.length){commentsByMemory={};return;}
  const ids=memories.map(m=>m.id);
  const {data,error}=await supabaseClient
    .from("comments")
    .select("id,memory_id,owner_id,comment_text,created_at")
    .in("memory_id",ids)
    .order("created_at",{ascending:true});
  if(error){console.error("Could not load comments",error);return;}
  commentsByMemory={};
  ids.forEach(id=>commentsByMemory[id]=[]);
  (data||[]).forEach(c=>{
    if(!commentsByMemory[c.memory_id])commentsByMemory[c.memory_id]=[];
    commentsByMemory[c.memory_id].push(c);
  });
  ids.forEach(id=>{
    document.querySelectorAll(`[data-comment-count="${CSS.escape(id)}"]`).forEach(el=>el.textContent=(commentsByMemory[id]||[]).length);
    renderDirectComments(id);
  });
}

// Extend social summary so likes + visible comments refresh together.
const originalLoadSocialSummaryDirect=loadSocialSummary;
loadSocialSummary=async function(){
  await originalLoadSocialSummaryDirect();
  await loadAllComments();
};

document.addEventListener("submit",async e=>{
  const form=e.target.closest("[data-quick-comment]");
  if(!form)return;
  e.preventDefault();
  e.stopPropagation();

  const memoryId=form.dataset.quickComment;
  const input=form.querySelector(".quick-comment-input");
  const send=form.querySelector(".quick-comment-send");
  const status=form.parentElement.querySelector(`[data-comment-status="${CSS.escape(memoryId)}"]`);
  const text=input.value.trim();
  if(!text)return;

  send.disabled=true;
  if(status)status.textContent="Sending...";
  try{
    await ensureUser();
    const {error}=await supabaseClient.from("comments").insert({
      memory_id:memoryId,
      owner_id:currentUser.id,
      commenter_name:"Guest",
      comment_text:text
    });
    if(error)throw error;
    input.value="";
    if(status)status.textContent="";
    await loadAllComments();
  }catch(err){
    console.error(err);
    if(status)status.textContent=`Comment failed: ${err.message||"Please try again."}`;
  }finally{
    send.disabled=false;
  }
});

document.addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit-direct-comment]");
  if(edit){
    e.preventDefault(); e.stopPropagation();
    const id=edit.dataset.editDirectComment;
    const memoryId=edit.dataset.memory;
    const textEl=document.querySelector(`[data-direct-comment-text="${CSS.escape(id)}"]`);
    const current=textEl?.textContent||"";
    const next=prompt("Edit your comment:",current);
    if(next===null)return;
    const clean=next.trim();
    if(!clean)return;
    const {error}=await supabaseClient.from("comments").update({comment_text:clean}).eq("id",id);
    if(error){alert("Could not edit comment: "+error.message);return;}
    await loadAllComments();
    return;
  }

  const del=e.target.closest("[data-delete-direct-comment]");
  if(del){
    e.preventDefault(); e.stopPropagation();
    if(!confirm("Delete your comment?"))return;
    const {error}=await supabaseClient.from("comments").delete().eq("id",del.dataset.deleteDirectComment);
    if(error){alert("Could not delete comment: "+error.message);return;}
    await loadAllComments();
  }
});

// Refresh visible comments for other people's new posts.
setInterval(()=>loadAllComments().catch(console.error),10000);
