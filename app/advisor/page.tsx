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

type BizData = {
  folderCount:     number;
  fileCount:       number;
  totalDataSize:   number;
  folderSummaries: {
    folderId:      string;
    folderName:    string;
    fileNames:     string[];
    fileTypes:     string[];
    fileCount:     number;
    readyCount:    number;
    parsedContent: string;
    lastAnalysis:  string;
  }[];
};

type RatingMap = Record<number, "good" | "bad">;

function Spinner({ size = 16, color = C.blue }: { size?: number; color?: string }) {
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
  const [businessData, setBusinessData] = useState<BizData | null>(null);
  const [ratings,      setRatings]      = useState<RatingMap>({});

  // Load chat history + ALL business data
  useEffect(() => {
    if (!user || loaded) return;
    Promise.all([
      getRecentChats(user.uid, 30),
      getAllBusinessData(user.uid),
    ]).then(([chats, bizData]) => {
      const bd = bizData as BizData;
      setBusinessData(bd);

      if (chats.length > 0) {
        setMessages(chats);
      } else {
        const hasFolders = bd.folderCount > 0;
        const totalFiles = bd.fileCount;
        const readyFiles = bd.folderSummaries.reduce((s, f) => s + f.readyCount, 0);
        const dataKB     = Math.round(bd.totalDataSize / 1024);

        setMessages([{
          role:    "assistant",
          content: hasFolders
            ? `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋\n\nI've loaded your **complete** business picture:\n${bd.folderSummaries.map(f => `\n• **${f.folderName}** — ${f.readyCount} of ${f.fileCount} files ready (${f.fileNames.join(", ")})`).join("")}\n\n**${readyFiles} files · ${dataKB}KB of business data** fully loaded — I can read every line of every file across all your folders.\n\nWhat would you like to know?`
            : `Hey ${profile?.name?.split(" ")[0] || "there"}! 👋 I'm your DashWise advisor.\n\nI don't see any uploaded files yet. Head to **Files** to create a folder and upload your business data — CSV, Excel, PDF — and I'll analyze every line of it.\n\nWhat questions do you have?`,
        }]);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [user, profile, loaded]);

  // Pre-fill from URL param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && loaded && !input) {
      setInput(q);
      inputRef.current?.focus();
    }
  }, [searchParams, loaded]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || thinking || !user) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setThinking(true);
    saveChatMessage(user.uid, userMsg).catch(console.error);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:     msg,
          profile:     { ...profile, uid: user.uid },
          businessData, // full data — no truncation
          chatHistory: messages.slice(-20).map(m => ({
            role:    m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Chat failed");

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      saveChatMessage(user.uid, assistantMsg).catch(console.error);

    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: `Something went wrong: ${err instanceof Error ? err.message : "Please try again."}`,
      }]);
    } finally { setThinking(false); }
  }

  async function rateMessage(
    msgIndex:       number,
    userMsg:        string,
    assistantMsg:   string,
    rating:         "good" | "bad",
  ) {
    setRatings(prev => ({ ...prev, [msgIndex]: rating }));
    try {
      await fetch("/api/train/rate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid:            user?.uid,
          userMessage:    userMsg,
          assistantReply: assistantMsg,
          rating,
          bizType:        profile?.bizType || "retail",
        }),
      });
    } catch { /* non-critical */ }
  }

  function renderMsg(content: string) {
    return content.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height: 6 }}/>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <p key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}/>;
      if (line.startsWith("•"))
        return <p key={i} style={{ marginBottom: 3, lineHeight: 1.6, paddingLeft: 8 }}>{line}</p>;
      return <p key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}>{line}</p>;
    });
  }

  const totalDataKB = businessData ? Math.round(businessData.totalDataSize / 1024) : 0;
  const readyFiles  = businessData?.folderSummaries.reduce((s, f) => s + f.readyCount, 0) || 0;

  return (
    <div style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", background: C.bg }}>

      {/* ── Context bar ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "8px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text3 }}>Advisor knows:</span>

          {businessData && businessData.folderCount > 0 ? (
            <>
              {businessData.folderSummaries.map(f => (
                <span key={f.folderId} style={{ fontSize: 11, background: C.blueBg, color: C.blue, padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>
                  📁 {f.folderName} ({f.readyCount} files)
                </span>
              ))}
              <span style={{ fontSize: 11, background: "#f0faf4", color: "#34c759", border: "1px solid #c8f0d8", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>
                ✓ {totalDataKB}KB fully loaded
              </span>
            </>
          ) : loaded ? (
            <span style={{ fontSize: 11, background: "#fff8e8", color: C.amber, padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>
              ⚠ No uploads —{" "}
              <Link href="/files" style={{ textDecoration: "underline", color: C.amber }}>upload files</Link>
            </span>
          ) : (
            <span style={{ fontSize: 11, color: C.text3, display: "flex", alignItems: "center", gap: 6 }}>
              <Spinner size={10}/> Loading all your business data...
            </span>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {!loaded && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Spinner size={28}/>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 12 }}>Loading all your business data...</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 10, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "assistant" && (
                <div style={{ width: 32, height: 32, background: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                  DW
                </div>
              )}
              <div>
                <div style={{
                  maxWidth: 520, padding: "12px 16px", borderRadius: 18, fontSize: 13,
                  background:              msg.role === "user" ? C.blue : C.surface,
                  color:                   msg.role === "user" ? "#fff"  : C.text,
                  boxShadow:               msg.role === "assistant" ? shadow.sm : "none",
                  border:                  msg.role === "assistant" ? `1px solid ${C.border}` : "none",
                  borderBottomRightRadius: msg.role === "user"      ? 4 : 18,
                  borderBottomLeftRadius:  msg.role === "assistant" ? 4 : 18,
                }}>
                  {renderMsg(msg.content)}
                </div>

                {/* Rating buttons — only on assistant replies after intro */}
                {msg.role === "assistant" && i > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 5, marginLeft: 2, alignItems: "center" }}>
                    {(["good", "bad"] as const).map(r => (
                      <button key={r} onClick={() => rateMessage(i, messages[i-1]?.content || "", msg.content, r)}
                        title={r === "good" ? "Helpful" : "Not helpful"}
                        style={{
                          background: ratings[i] === r ? (r === "good" ? "#f0faf4" : C.redBg) : "transparent",
                          border:     `1px solid ${ratings[i] === r ? (r === "good" ? "#34c759" : C.red) : C.border}`,
                          borderRadius: 6, padding: "3px 8px", fontSize: 13, cursor: "pointer",
                          color: ratings[i] === r ? (r === "good" ? "#34c759" : C.red) : C.text3,
                        }}>
                        {r === "good" ? "👍" : "👎"}
                      </button>
                    ))}
                    {ratings[i] && (
                      <span style={{ fontSize: 11, color: C.text3 }}>
                        {ratings[i] === "good" ? "Thanks — helps us improve!" : "Got it, we'll do better."}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 32, height: 32, background: C.blue, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>DW</div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, borderBottomLeftRadius: 4, padding: "14px 16px", display: "flex", gap: 5, alignItems: "center", boxShadow: shadow.sm }}>
                {[0,1,2].map(n => (
                  <div key={n} style={{ width: 7, height: 7, background: C.text3, borderRadius: "50%", animation: `bounce .9s ease infinite`, animationDelay: `${n*.15}s` }}/>
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>
      </div>

      {/* ── Suggested questions ── */}
      {loaded && messages.length <= 2 && (
        <div style={{ padding: "0 20px 10px", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 8, fontWeight: 500 }}>Try asking:</div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7 }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => sendMessage(q)} style={{
                  fontSize: 12, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 20, padding: "6px 13px", color: C.text2, cursor: "pointer",
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask anything about your business..."
            style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: radius.md, padding: "11px 14px", fontSize: 14, color: C.text, resize: "none", outline: "none", lineHeight: 1.5 }}
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || thinking}
            style={{ width: 42, height: 42, borderRadius: radius.md, background: C.blue, border: "none", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: (!input.trim() || thinking) ? .4 : 1, flexShrink: 0 }}>
            →
          </button>
        </div>
        {businessData && businessData.totalDataSize > 0 && (
          <div style={{ maxWidth: 720, margin: "4px auto 0", fontSize: 11, color: C.text3, textAlign: "center" as const }}>
            {readyFiles} file{readyFiles !== 1 ? "s" : ""} across {businessData.folderCount} folder{businessData.folderCount !== 1 ? "s" : ""} · {totalDataKB}KB loaded · Shift+Enter for new line
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>
    </div>
  );
}

export default function AdvisorPage() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Nav/>
      <Suspense fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 52px)", color: C.text3, fontSize: 14 }}>
          Loading advisor...
        </div>
      }>
        <AdvisorInner/>
      </Suspense>
    </div>
  );
}
