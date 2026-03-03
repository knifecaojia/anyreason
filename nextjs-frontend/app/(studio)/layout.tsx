import { getMe } from "@/components/actions/me-actions";
import { redirect } from "next/navigation";

/**
 * Studio route group layout — full-screen immersive, no global navigation.
 * Auth check: redirects to /login if not authenticated.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();

  if (!me) {
    redirect("/login");
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-textMain">
      {children}
    </div>
  );
}
