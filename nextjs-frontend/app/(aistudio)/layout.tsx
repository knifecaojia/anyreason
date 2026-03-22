import { AppLayout } from "@/components/aistudio/AppLayout";
import { CreditsProvider } from "@/components/credits/CreditsContext";
import { getMe } from "@/components/actions/me-actions";
import { creditsMy } from "@/components/actions/credits-actions";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  
  // If getMe failed (not logged in), redirect to login
  if (!me) {
      redirect("/login");
  }

  // Fetch credits balance server-side alongside user data
  // This avoids a client-side loading flash and ensures balance is immediately visible
  let initialBalance = 0;
  try {
    const creditsResponse = await creditsMy();
    if (creditsResponse?.data?.balance !== undefined) {
      initialBalance = creditsResponse.data.balance;
    }
  } catch (error) {
    // If credits fetch fails, show 0 balance - not critical enough to block the page
    console.error("Failed to fetch initial credits balance:", error);
  }

  return (
    <CreditsProvider initialBalance={initialBalance}>
      <AppLayout me={me}>{children}</AppLayout>
    </CreditsProvider>
  );
}
