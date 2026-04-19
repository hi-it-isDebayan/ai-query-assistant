import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import {
  Sparkles,
  Plus,
  Send,
  LogOut,
  Trash2,
  Menu,
  X,
  Bot,
} from "lucide-react";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "Chat — PolyChat" },
      { name: "description", content: "Auto-routed multi-model AI chat." },
    ],
  }),
});

type Chat = { id: string; title: string; updated_at: string };
type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  created_at: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

function ChatPage() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    void loadChats();
    void loadProfile();
  }, [user]);

  useEffect(() => {
    if (activeChatId) void loadMessages(activeChatId);
    else setMessages([]);
  }, [activeChatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function loadProfile() {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile(data ?? { display_name: null, avatar_url: null });
  }

  async function loadChats() {
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load chats");
      return;
    }
    setChats(data ?? []);
    if (!activeChatId && data && data.length > 0) setActiveChatId(data[0].id);
  }

  async function loadMessages(chatId: string) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Failed to load messages");
      return;
    }
    setMessages((data ?? []) as Message[]);
  }

  async function newChat() {
    if (!user) return;
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: "New chat" })
      .select()
      .single();
    if (error) {
      toast.error("Could not create chat");
      return;
    }
    setChats((prev) => [data as Chat, ...prev]);
    setActiveChatId(data.id);
    setSidebarOpen(false);
  }

  async function deleteChat(id: string) {
    const { error } = await supabase.from("chats").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete chat");
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !user) return;
    setInput("");
    setSending(true);

    let chatId = activeChatId;
    let isFirstMessage = false;
    try {
      // Create chat if none active
      if (!chatId) {
        const title = text.length > 60 ? text.slice(0, 60) + "…" : text;
        const { data, error } = await supabase
          .from("chats")
          .insert({ user_id: user.id, title })
          .select()
          .single();
        if (error) throw error;
        chatId = data.id;
        setActiveChatId(chatId);
        setChats((prev) => [data as Chat, ...prev]);
        isFirstMessage = true;
      } else if (messages.length === 0) {
        isFirstMessage = true;
        const title = text.length > 60 ? text.slice(0, 60) + "…" : text;
        await supabase.from("chats").update({ title }).eq("id", chatId);
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title } : c))
        );
      }

      // Persist user message
      const { data: userMsg, error: userErr } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId!,
          user_id: user.id,
          role: "user",
          content: text,
        })
        .select()
        .single();
      if (userErr) throw userErr;

      const newMessages = [...messages, userMsg as Message];
      setMessages(newMessages);

      // Optimistic assistant placeholder
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          chat_id: chatId!,
          role: "assistant",
          content: "",
          model: null,
          created_at: new Date().toISOString(),
        },
      ]);

      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok || !resp.body) {
        let msg = "Failed to get response";
        try {
          const j = await resp.json();
          msg = j.error || msg;
        } catch {}
        if (resp.status === 429) msg = "Rate limit hit. Please wait a moment and try again.";
        if (resp.status === 402) msg = "AI credits exhausted. Add credits to keep chatting.";
        throw new Error(msg);
      }

      const modelUsed = resp.headers.get("X-Model-Used") ?? null;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantText += delta;
              setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? { ...m, content: assistantText, model: modelUsed } : m))
              );
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Persist assistant message
      const { data: aMsg, error: aErr } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId!,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
          model: modelUsed,
        })
        .select()
        .single();
      if (aErr) throw aErr;
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (aMsg as Message) : m)));

      // Touch chat updated_at
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId!);
      if (isFirstMessage) void loadChats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      // Remove placeholder
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  }

  const initials = (profile?.display_name || user.email || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform md:relative md:translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div
              className="grid h-8 w-8 place-items-center rounded-md text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold">PolyChat</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-3">
          <Button
            onClick={newChat}
            className="w-full justify-start"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="mr-2 h-4 w-4" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 ? (
            <p className="px-3 py-4 text-xs text-sidebar-foreground/60">
              No chats yet. Start one!
            </p>
          ) : (
            <ul className="space-y-1">
              {chats.map((c) => (
                <li key={c.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      activeChatId === c.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <button
                      className="flex-1 truncate text-left"
                      onClick={() => {
                        setActiveChatId(c.id);
                        setSidebarOpen(false);
                      }}
                    >
                      {c.title}
                    </button>
                    <button
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => deleteChat(c.id)}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {profile?.display_name || user.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">
            {chats.find((c) => c.id === activeChatId)?.title ?? "New chat"}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && !sending && (
              <div className="grid place-items-center py-20 text-center">
                <div
                  className="mb-4 grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold">How can I help?</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Ask anything — coding, research, math, summaries. PolyChat picks the best model.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} initials={initials} avatarUrl={profile?.avatar_url ?? null} />
            ))}
          </div>
        </div>

        <div className="border-t bg-background px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask anything…  (Enter to send · Shift+Enter for new line)"
              rows={1}
              className="max-h-40 min-h-[44px] resize-none"
              disabled={sending}
            />
            <Button
              onClick={send}
              disabled={sending || !input.trim()}
              size="icon"
              className="h-11 w-11 shrink-0"
              style={{ background: "var(--gradient-primary)" }}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
            Auto-routes to GPT-5, Gemini 2.5 Pro, or Gemini 2.5 Flash.
          </p>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({
  m,
  initials,
  avatarUrl,
}: {
  m: Message;
  initials: string;
  avatarUrl: string | null;
}) {
  const isUser = m.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0">
        {isUser ? (
          <>
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </>
        ) : (
          <AvatarFallback
            className="text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        )}
      </Avatar>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex min-w-0 flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "border bg-card text-card-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{m.content}</p>
          ) : m.content ? (
            <Markdown>{m.content}</Markdown>
          ) : (
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          )}
        </div>
        {!isUser && m.model && (
          <span className="mt-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {m.model}
          </span>
        )}
      </div>
    </div>
  );
}
