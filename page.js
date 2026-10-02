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
  return `<article class="memory-card" style="--tilt:${tilt}deg" data-open-memory="${esc(m.id)}">
    ${removeButton}
    <img src="${esc(m.image)}" alt="${esc(m.description||m.name)}" loading="lazy">
    <div class="card-meta">
      <h3>${esc(m.name)}</h3>
      ${m.description?`<p>${esc(m.description)}</p>`:""}
      ${m.date?`<small>${esc(m.date)}</small>`:""}
      <div class="card-social">
        <button type="button" class="card-like" data-like-memory="${esc(m.id)}" aria-label="Like memory">♡ <span data-like-count="${esc(m.id)}">0</span></button>
        <button type="button" class="open-comments-btn" data-open-comments="${esc(m.id)}">💬 <span data-comment-count="${esc(m.id)}">0</span> comments</button>
      </div>
      <form class="inline-comment-box" data-inline-comment-form="${esc(m.id)}">
        <div class="inline-comment-title">Put your comment</div>
        <input class="inline-comment-name" maxlength="60" required placeholder="Your name">
        <textarea class="inline-comment-text" maxlength="300" required placeholder="Write a comment..."></textarea>
        <button class="btn primary inline-comment-submit" type="submit">Post Comment</button>
        <small class="inline-comment-status" aria-live="polite"></small>
      </form>
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
  if(file.size>4*1024*1024){statusEl.textContent="Please use a photo smaller than 4 MB.";return;}

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


/* ---------- Memory comments ---------- */
const memoryModal=document.getElementById("memoryModal");
const modalMemoryImage=document.getElementById("modalMemoryImage");
const modalMemoryTitle=document.getElementById("modalMemoryTitle");
const modalMemoryDescription=document.getElementById("modalMemoryDescription");
const modalMemoryDate=document.getElementById("modalMemoryDate");
const commentsList=document.getElementById("commentsList");
const commentsCount=document.getElementById("commentsCount");
const commentForm=document.getElementById("commentForm");
const commentName=document.getElementById("commentName");
const commentText=document.getElementById("commentText");
const commentStatus=document.getElementById("commentStatus");

let activeMemoryId=null;
let commentsRefreshTimer=null;
let replyingToCommentId=null;
let editingCommentId=null;

function formatCommentTime(value){
  try{
    const d=new Date(value);
    return d.toLocaleString([], {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  }catch(e){return "";}
}

function renderComments(comments){
  if(!commentsList)return;
  commentsCount.textContent=`${comments.length} comment${comments.length===1?"":"s"}`;
  if(!comments.length){
    commentsList.innerHTML='<p class="comments-empty">No comments yet. Be the first to leave one.</p>';
    return;
  }
  const byParent=new Map();
  comments.forEach(c=>{
    const key=c.parent_comment_id||"root";
    if(!byParent.has(key))byParent.set(key,[]);
    byParent.get(key).push(c);
  });
  const renderOne=(c,reply=false)=>{
    const mine=!!currentUser && c.owner_id===currentUser.id;
    const actions=[];
    actions.push(`<button type="button" class="comment-action" data-reply-comment="${esc(c.id)}" data-reply-name="${esc(c.commenter_name)}">Reply</button>`);
    if(mine){
      actions.push(`<button type="button" class="comment-action" data-edit-comment="${esc(c.id)}">Edit</button>`);
      actions.push(`<button type="button" class="comment-action danger" data-comment-id="${esc(c.id)}">Delete</button>`);
    }
    const replies=(byParent.get(c.id)||[]).map(r=>renderOne(r,true)).join("");
    return `<article class="comment-item ${reply?"comment-reply":""}" data-comment-row="${esc(c.id)}">
      <div class="comment-item-head"><strong>${esc(c.commenter_name)}</strong><small>${esc(formatCommentTime(c.created_at))}</small></div>
      <p data-comment-text="${esc(c.id)}">${esc(c.comment_text)}</p>
      <div class="comment-actions">${actions.join("")}</div>
      ${replies?`<div class="comment-replies">${replies}</div>`:""}
    </article>`;
  };
  commentsList.innerHTML=(byParent.get("root")||[]).map(c=>renderOne(c,false)).join("");
}

async function loadComments(memoryId,{silent=false}={}){
  if(!memoryId)return;
  if(!silent && commentStatus)commentStatus.textContent="Loading comments…";
  const {data,error}=await supabaseClient
    .from("comments")
    .select("id, memory_id, owner_id, commenter_name, comment_text, parent_comment_id, created_at")
    .eq("memory_id",memoryId)
    .order("created_at",{ascending:true});
  if(error){
    if(commentStatus)commentStatus.textContent=`Could not load comments: ${error.message}`;
    return;
  }
  renderComments(data||[]);
  if(!silent && commentStatus)commentStatus.textContent="";
}

async function openMemoryModal(memoryId){
  const memory=uploaded.find(m=>String(m.id)===String(memoryId));
  if(!memory || !memoryModal)return;
  activeMemoryId=memory.id;
  modalMemoryImage.src=memory.image;
  modalMemoryImage.alt=memory.description||memory.name||"Memory";
  modalMemoryTitle.textContent=memory.name||"Memory";
  modalMemoryDescription.textContent=memory.description||"";
  modalMemoryDate.textContent=memory.date||"";
  memoryModal.hidden=false;
  document.body.classList.add("modal-open");
  await ensureUser();
  await loadComments(activeMemoryId);
  clearInterval(commentsRefreshTimer);
  commentsRefreshTimer=setInterval(()=>{
    if(activeMemoryId && !memoryModal.hidden){
      loadComments(activeMemoryId,{silent:true}).catch(console.error);
    }
  },10000);
}

function closeMemoryModal(){
  if(!memoryModal)return;
  memoryModal.hidden=true;
  document.body.classList.remove("modal-open");
  activeMemoryId=null;
  clearInterval(commentsRefreshTimer);
  commentsRefreshTimer=null;
  if(commentStatus)commentStatus.textContent="";
}

document.addEventListener("click",e=>{
  if(e.target.closest("[data-memory-id]") || e.target.closest(".remove-memory"))return;
  const commentsBtn=e.target.closest("[data-open-comments]");
  if(commentsBtn){
    e.preventDefault();
    e.stopPropagation();
    openMemoryModal(commentsBtn.dataset.openComments).catch(console.error);
    return;
  }
  if(e.target.closest("[data-close-modal]"))closeMemoryModal();
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && memoryModal && !memoryModal.hidden){closeMemoryModal();return;}
});

if(commentForm){
  const savedName=localStorage.getItem("memoryCommentName");
  if(savedName) commentName.value=savedName;
  commentForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!activeMemoryId)return;
    const name=commentName.value.trim();
    const text=commentText.value.trim();
    if(!name || !text){ commentStatus.textContent="Please fill in your name and comment."; return; }
    const btn=commentForm.querySelector('button[type="submit"]');
    btn.disabled=true; btn.textContent="Posting…";
    commentStatus.textContent=editingCommentId?"Saving comment…":"Posting comment…";
    try{
      await ensureUser();
      let error=null;
      if(editingCommentId){
        ({error}=await supabaseClient.from("comments").update({comment_text:text}).eq("id",editingCommentId));
      }else{
        ({error}=await supabaseClient.from("comments").insert({
          memory_id:activeMemoryId,
          owner_id:currentUser.id,
          commenter_name:name,
          comment_text:text,
          parent_comment_id:replyingToCommentId
        }));
      }
      if(error) throw error;
      commentText.value="";
      replyingToCommentId=null;
      editingCommentId=null;
      btn.textContent="Post Comment";
      localStorage.setItem("memoryCommentName",name);
      await loadComments(activeMemoryId,{silent:true});
      await loadSocialSummary().catch(console.error);
      commentStatus.textContent=editingCommentId?"Comment updated.":"Comment posted.";
    }catch(err){
      console.error(err);
      commentStatus.textContent=`Comment failed: ${err.message || "Please try again."}`;
    }finally{
      btn.disabled=false; btn.textContent="Post Comment";
    }
  });
}

commentsList?.addEventListener("click",async e=>{
  const replyBtn=e.target.closest("[data-reply-comment]");
  if(replyBtn){
    replyingToCommentId=replyBtn.dataset.replyComment;
    editingCommentId=null;
    commentText.value="";
    commentText.placeholder=`Reply to ${replyBtn.dataset.replyName}...`;
    commentText.focus();
    commentStatus.textContent=`Replying to ${replyBtn.dataset.replyName}`;
    return;
  }

  const editBtn=e.target.closest("[data-edit-comment]");
  if(editBtn){
    editingCommentId=editBtn.dataset.editComment;
    replyingToCommentId=null;
    const textEl=commentsList.querySelector(`[data-comment-text="${CSS.escape(editingCommentId)}"]`);
    commentText.value=textEl?.textContent||"";
    commentText.placeholder="Edit your comment...";
    commentText.focus();
    commentStatus.textContent="Editing your comment";
    commentForm.querySelector('button[type="submit"]').textContent="Save Edit";
    return;
  }

  const btn=e.target.closest("[data-comment-id]");
  if(!btn)return;
  if(!confirm("Delete your comment?"))return;
  btn.disabled=true;
  try{
    const {error}=await supabaseClient.from("comments").delete().eq("id",btn.dataset.commentId);
    if(error) throw error;
    await loadComments(activeMemoryId,{silent:true});
    await loadSocialSummary().catch(console.error);
  }catch(err){
    console.error(err);
    commentStatus.textContent=`Delete failed: ${err.message || "Please try again."}`;
    btn.disabled=false;
  }
});


/* ---------- Always-visible inline comment box ---------- */
function fillSavedCommentNames(){
  const savedName=localStorage.getItem("memoryCommentName")||"";
  if(!savedName)return;
  document.querySelectorAll(".inline-comment-name").forEach(input=>{
    if(!input.value) input.value=savedName;
  });
}

// Re-fill the remembered name every time cards are rendered.
const originalRenderForInlineComments=render;
render=function(){
  originalRenderForInlineComments();
  fillSavedCommentNames();
};

document.addEventListener("submit",async e=>{
  const inlineForm=e.target.closest("[data-inline-comment-form]");
  if(!inlineForm)return;
  e.preventDefault();
  e.stopPropagation();

  const memoryId=inlineForm.dataset.inlineCommentForm;
  const nameInput=inlineForm.querySelector(".inline-comment-name");
  const textInput=inlineForm.querySelector(".inline-comment-text");
  const status=inlineForm.querySelector(".inline-comment-status");
  const submit=inlineForm.querySelector(".inline-comment-submit");
  const name=nameInput.value.trim();
  const text=textInput.value.trim();

  if(!name || !text){
    status.textContent="Please enter your name and comment.";
    return;
  }

  submit.disabled=true;
  submit.textContent="Posting…";
  status.textContent="Posting comment…";

  try{
    await ensureUser();
    const {error}=await supabaseClient.from("comments").insert({
      memory_id:memoryId,
      owner_id:currentUser.id,
      commenter_name:name,
      comment_text:text,
      parent_comment_id:null
    });
    if(error)throw error;

    localStorage.setItem("memoryCommentName",name);
    textInput.value="";
    status.textContent="Comment posted ✓";
    await loadSocialSummary();

    // Keep name synchronized across all cards on the page.
    document.querySelectorAll(".inline-comment-name").forEach(input=>input.value=name);
  }catch(err){
    console.error(err);
    status.textContent=`Comment failed: ${err.message || "Please try again."}`;
  }finally{
    submit.disabled=false;
    submit.textContent="Post Comment";
  }
});

// Stop card/delete/like handlers from hijacking typing and form clicks.
document.addEventListener("click",e=>{
  if(e.target.closest(".inline-comment-box")) e.stopPropagation();
},true);
