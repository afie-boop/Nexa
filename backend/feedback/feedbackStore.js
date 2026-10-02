const fs=require("fs");
const path=require("path");
const FEEDBACKS_FILE=path.join(__dirname,"data","feedbacks.json");
function ensure(){const dir=path.dirname(FEEDBACKS_FILE);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(FEEDBACKS_FILE))fs.writeFileSync(FEEDBACKS_FILE,"[]","utf8");}
function read(){try{ensure();return JSON.parse(fs.readFileSync(FEEDBACKS_FILE,"utf8"));}catch(e){console.error("[feedbackStore] Gagal membaca feedback:",e.message);return [];}}
function write(list){try{ensure();fs.writeFileSync(FEEDBACKS_FILE,JSON.stringify(list,null,2),"utf8");return true;}catch(e){console.error("[feedbackStore] Gagal menyimpan feedback:",e.message);return false;}}
module.exports={getFeedbacks:read,addFeedback(feedback={}){const list=read();const item={id:feedback.id||"fb_"+Date.now()+"_"+Math.random().toString(36).substring(2,7),conversation_id:feedback.conversation_id||"",message_id:feedback.message_id||"",user_message:feedback.user_message||"",ai_response:feedback.ai_response||"",provider:feedback.provider||"",model:feedback.model||"",type:feedback.type||"positive",reason:feedback.reason||"",created_at:feedback.created_at||new Date().toISOString()};const i=list.findIndex(f=>f.conversation_id===item.conversation_id&&f.message_id===item.message_id);if(i!==-1)list[i]=item;else list.push(item);write(list);return item;}};
ensure();
