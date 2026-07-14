import { useEffect, useRef, useState } from "react";

interface LiveCameraProps {
  streamName: string;
  baseUrl?: string;
}

const LiveCamera = ({ streamName, baseUrl = "/mediamtx" }: LiveCameraProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("Connecting");

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        setStatus("Connecting");

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (!videoRef.current || cancelled) return;
          videoRef.current.srcObject = event.streams[0];
          setStatus("Live");
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setStatus("Disconnected");
          }
          if (pc.connectionState === "connected") {
            setStatus("Live");
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const response = await fetch(`${baseUrl}/${streamName}/whep`, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });

        if (!response.ok) {
          throw new Error(`WHEP failed: ${response.status}`);
        }

        const answer = await response.text();

        await pc.setRemoteDescription({
          type: "answer",
          sdp: answer,
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("Connection failed");
      }
    };

    start();

    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [baseUrl, streamName]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-contain"
      />

      <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] uppercase tracking-wider text-white">
        WebRTC · {status}
      </div>
    </div>
  );
};

export default LiveCamera;