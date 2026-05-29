"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getRecentChats, saveChatMessage, getAllBusinessData, ChatMessage } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow } from "@/lib/styles";

const SUGGESTED = [
  "What's the overall health of my business?",
  "Compare performance across all my folders",
  "Where am I losing the most money?",
  "What should I focus on this week?",
  "What trends do you see across all my data?",
  "Which part of my business is growing fastest?",
  "What's my biggest risk right now?",
  "How do I improve my overall margins?",
];

function Spinner({ size=16, color=C.blue }: { size?: number; color?: string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}

function AdvisorInner() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);

  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [input,        setInput]        = useState("");
  const [thinking,     setThinking]     = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [businessData, setBusinessData] = useState<unknown>(null);

  useEffect(() => {
    if (!user || loaded) return;
    Promise.all([
      getRecentChats(user.uid, 20),
      getAllBusinessData(user.uid),
    ]).then(([chats, bizData]) => {
      setBusinessData(bizData);
      if (chats.length > 0) {
        setMessages(chats);
      } else {
        const bd = bizData as { folderCount: number; fileCount: number; folderSummaries: { folderName: string; fileNames: string[] }[] };
        const hasFolders = bd.folderCount > 0;
        setMessages([{
          role: "assistant",
          content: hasFolders
            ? `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋\n\nI've loaded your full business picture — **${bd.folderCount} folder${bd.folderCount!==1?"s":""}** with **${bd.fileCount} file${bd.fileCount!==1?"s":""}** across:\n${bd.folderSummaries.map(f=>`• **${f.folderName}** — ${f.fileNames.join(", ")}`).join("\n")}\n\nI can see patterns across all your data. What would you like to know?`
            : `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋 I'm your DashWise advisor.\n\nI don't see any uploaded files yet. Head to the **Files** page to create a folder and upload your business data — I'll give you specific insights about your numbers.\n\nIn the meantime, what questions do you have?`,
        }]);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [user, profile, loaded]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && loaded && !input) { setInput(q); inputRef.current?.focus(); }
  }, [searchParams, loaded]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, thinking]);

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || thinking || !user) return;
    const userMsg: ChatMessage = { role:"user", content:msg };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setThinking(true);
    saveChatMessage(user.uid, userMsg).catch(console.error);
    try {
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message:msg, profile, businessData, chatHistory:messages.slice(-20) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const assistantMsg: ChatMessage = { role:"assistant", content:data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      saveChatMessage(user.uid, assistantMsg).catch(console.error);
    } catch (err: unknown) {
      setMessages(prev => [...prev, { role:"assistant", content:`Something went wrong: ${err instanceof Error ? err.message : "Please try again."}` }]);
    } finally { setThinking(false); }
  }

  function renderMsg(content: string) {
    return content.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:6 }}/>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <p key={i} style={{ marginBottom:3, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>") }}/>;
      return <p key={i} style={{ marginBottom:3, lineHeight:1.6 }}>{line}</p>;
    });
  }

  const bd = businessData as { folderCount?: number; fileCount?: number; folderSummaries?: { folderName: string }[] } | null;

  return (
    <div style={{ height:"calc(100vh - 52px)", display:"flex", flexDirection:"column", background:C.bg }}>

      {/* Context bar */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"8px 24px", flexShrink:0 }}>
        <div style={{ maxWidth:700, margin:"0 auto", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
          <span style={{ fontSize:11, fontWeight:600, color:C.text3 }}>Advisor knows:</span>
          {profile?.bizName && (
            <span style={{ fontSize:11, background:C.blueBg, color:C.blue, padding:"2px 10px", borderRadius:20, fontWeight:500 }}>
              🏪 {profile.bizName}
            </span>
          )}
          {bd && bd.folderCount && bd.folderCount > 0 ? (
            <>
              <span style={{ fontSize:11, background:C.blueBg, color:C.blue, padding:"2px 10px", borderRadius:20, fontWeight:500 }}>
                📁 {bd.folderCount} folder{bd.folderCount!==1?"s":""}
              </span>
              <span style={{ fontSize:11, background:C.blueBg, color:C.blue, padding:"2px 10px", borderRadius:20, fontWeight:500 }}>
                📄 {bd.fileCount} file{(bd.fileCount||0)!==1?"s":""}
              </span>
              {bd.folderSummaries?.map(f => (
                <span key={f.folderName} style={{ fontSize:11, background:C.blueBg, color:C.blue, padding:"2px 10px", borderRadius:20, fontWeight:500 }}>
                  {f.folderName}
                </span>
              ))}
            </>
          ) : loaded ? (
            <span style={{ fontSize:11, background:"#fff8e8", color:C.amber, padding:"2px 10px", borderRadius:20, fontWeight:500 }}>
              ⚠️ No uploads yet —{" "}
              <Link href="/files" style={{ textDecoration:"underline", color:C.amber }}>upload files</Link>
            </span>
          ) : (
            <span style={{ fontSize:11, color:C.text3 }}>Loading your business data...</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"24px" }}>
        <div style={{ maxWidth:700, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>
          {!loaded && (
            <div style={{ textAlign:"center", padding:40 }}>
              <Spinner size={28}/><div style={{ fontSize:13, color:C.text3, marginTop:10 }}>Loading all your business data...</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display:"flex", gap:12, justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              {msg.role === "assistant" && (
                <div style={{ width:34, height:34, background:C.blue, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0, marginTop:2 }}>
                  DW
                </div>
              )}
              <div style={{
                maxWidth:520, padding:"12px 16px", borderRadius:16, fontSize:13,
                background:   msg.role==="user" ? C.blue : C.surface,
                color:        msg.role==="user" ? "#fff" : C.text,
                borderBottomRight: msg.role==="user" ? "4px" : undefined,
                borderBottomLeft:  msg.role==="assistant" ? "4px" : undefined,
                boxShadow:    msg.role==="assistant" ? shadow.sm : "none",
                border:       msg.role==="assistant" ? `1px solid ${C.border}` : "none",
                borderBottomRightRadius: msg.role==="user" ? 4 : 16,
                borderBottomLeftRadius:  msg.role==="assistant" ? 4 : 16,
              }}>
                {renderMsg(msg.content)}
              </div>
            </div>
          ))}

          {thinking && (
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ width:34, height:34, background:C.blue, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0 }}>DW</div>
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, borderBottomLeftRadius:4, padding:"14px 16px", display:"flex", gap:5, alignItems:"center", boxShadow:shadow.sm }}>
                {[0,1,2].map(n => (
                  <div key={n} style={{ width:7, height:7, background:C.text3, borderRadius:"50%", animation:"bounce .9s ease infinite", animationDelay:`${n*.15}s` }}/>
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>
      </div>

      {/* Suggested */}
      {loaded && messages.length <= 2 && (
        <div style={{ padding:"0 24px 12px", flexShrink:0 }}>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <div style={{ fontSize:11, color:C.text3, marginBottom:8, fontWeight:500 }}>Try asking:</div>
            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={()=>sendMessage(q)} style={{
                  fontSize:12, background:C.surface, border:`1px solid ${C.border}`,
                  borderRadius:20, padding:"6px 14px", color:C.text2, cursor:"pointer",
                  transition:"all 0.15s",
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"12px 24px", flexShrink:0 }}>
        <div style={{ maxWidth:700, margin:"0 auto", display:"flex", gap:10, alignItems:"flex-end" }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} }}
            placeholder="Ask anything about your business..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.md, padding:"11px 14px", fontSize:14, color:C.text, resize:"none", outline:"none", lineHeight:1.5 }}
          />
          <button onClick={()=>sendMessage()} disabled={!input.trim()||thinking} style={{
            width:42, height:42, borderRadius:radius.md, background:C.blue, border:"none",
            color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            opacity:(!input.trim()||thinking)?.4:1, flexShrink:0,
          }}>
            →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      `}</style>
    </div>
  );
}

export default function AdvisorPage() {
  return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      <Nav/>
      <Suspense fallback={<div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"calc(100vh - 52px)", color:C.text3, fontSize:14 }}>Loading advisor...</div>}>
        <AdvisorInner/>
      </Suspense>
    </div>
  );
}
