const MakoBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden">
    {/* Base gradient */}
    <div className="absolute inset-0 bg-background" />

    {/* Cinematic top glow */}
    <div
      className="absolute inset-0"
      style={{
        background: "radial-gradient(circle at 50% 15%, hsla(195, 100%, 50%, 0.08), transparent 60%)",
      }}
    />

    {/* Ambient light streaks */}
    <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/[0.06] to-transparent mako-streak" />
    <div
      className="absolute top-2/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/[0.04] to-transparent mako-streak"
      style={{ animationDelay: "8s" }}
    />

    {/* Subtle vignette */}
    <div className="absolute inset-0 mako-vignette" />
  </div>
);

export default MakoBackground;
