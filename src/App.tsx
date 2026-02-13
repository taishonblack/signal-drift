import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Sessions from "./pages/Sessions";
import CreateSession from "./pages/CreateSession";
import SessionRoom from "./pages/SessionRoom";
import JoinSession from "./pages/JoinSession";
import SettingsPage from "./pages/SettingsPage";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Landing — no sidebar */}
          <Route path="/" element={<Landing />} />

          {/* App routes — with sidebar/nav */}
          <Route path="/sessions" element={<AppLayout><Sessions /></AppLayout>} />
          <Route path="/create" element={<AppLayout><CreateSession /></AppLayout>} />
          <Route path="/session/:id" element={<AppLayout><SessionRoom /></AppLayout>} />
          <Route path="/join" element={<AppLayout><JoinSession /></AppLayout>} />
          <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
