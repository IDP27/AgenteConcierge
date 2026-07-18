import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";

export const metadata = { title: "Concierge — Resort Paraíso" };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
