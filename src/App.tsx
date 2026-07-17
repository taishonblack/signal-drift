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
import AccountPage from "./pages/AccountPage";
import OpsDashboard from "./pages/OpsDashboard";
import AppLayout from "./components/AppLayout";
import SourcePopoutPage from "./pages/SourcePopoutPage";
import TimelinePopoutPage from "./pages/TimelinePopoutPage";
import LayoutPopoutPage from "./pages/LayoutPopoutPage";
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
          <Route path="/session/:id/configure" element={<AppLayout><CreateSession /></AppLayout>} />
          <Route path="/session/:id" element={<AppLayout><SessionRoom /></AppLayout>} />
          <Route path="/join" element={<AppLayout><JoinSession /></AppLayout>} />
          <Route path="/join/:sessionId" element={<AppLayout><JoinSession /></AppLayout>} />
          <Route path="/account" element={<AppLayout><AccountPage /></AppLayout>} />
          <Route path="/ops" element={<AppLayout><OpsDashboard /></AppLayout>} />

          {/* Popout windows — no sidebar/AppLayout */}
          <Route path="/session/:sessionId/popout/source/:sourceId" element={<SourcePopoutPage />} />
          <Route path="/session/:sessionId/popout/timeline" element={<TimelinePopoutPage />} />
          <Route path="/session/:sessionId/popout/view" element={<LayoutPopoutPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
