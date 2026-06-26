import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardNavbar } from "@/modules/dashboard/ui/dashboard-navbar";
import { DashboardSidebar } from "@/modules/dashboard/ui/dashboard-sidebar";

interface Props {
  children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
  return (
    <SidebarProvider>
      <DashboardSidebar/>
      <main className="flex flex-col min-h-screen w-full bg-[#f4f6f9] ml-64">
        <DashboardNavbar/>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
};

export default Layout;