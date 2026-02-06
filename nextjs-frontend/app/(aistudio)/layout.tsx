import { AppLayout } from "@/components/aistudio/AppLayout";
import { getMe } from "@/components/actions/me-actions";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return <AppLayout me={me}>{children}</AppLayout>;
}
