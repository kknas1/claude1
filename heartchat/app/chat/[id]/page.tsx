import { notFound } from "next/navigation";
import { getCharacter } from "@/lib/characters";
import { ChatRoom } from "./ChatRoom";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const character = getCharacter(id);
  if (!character) notFound();

  return <ChatRoom character={character} />;
}
