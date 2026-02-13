import { Switch } from "@/components/ui/switch";

const SettingsPage = () => (
  <div className="max-w-lg mx-auto space-y-8">
    <div>
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="text-sm text-muted-foreground">Display and navigation preferences</p>
    </div>

    <div className="mako-glass rounded-lg divide-y divide-border/10">
      <SettingRow label="Dark mode" description="MAKO uses dark mode only" disabled checked />
      <SettingRow label="Show sidebar labels" description="Show text labels in sidebar" checked />
      <SettingRow label="Auto-collapse sidebar" description="Collapse sidebar on small screens" checked />
      <SettingRow label="Show metric overlays" description="Display bitrate/loss on stream tiles" checked />
    </div>

    <div className="mako-glass rounded-lg p-4">
      <p className="text-xs text-muted-foreground">
        Account & authentication settings will appear here once backend is connected.
      </p>
    </div>
  </div>
);

const SettingRow = ({ label, description, checked, disabled }: { label: string; description: string; checked?: boolean; disabled?: boolean }) => (
  <div className="flex items-center justify-between px-4 py-3">
    <div>
      <p className="text-sm text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch defaultChecked={checked} disabled={disabled} />
  </div>
);

export default SettingsPage;
