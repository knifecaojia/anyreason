import { AppLayout } from "@/components/aistudio/AppLayout";
import { getMe } from "@/components/actions/me-actions";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  
  // If getMe failed (not logged in), redirect to login
  if (!me) {
      redirect("/login");
  }

  return <AppLayout me={me}>{children}</AppLayout>;
}
