import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#059669", borderRadius: 112 }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 280, height: 280 }}>
        <div style={{ position: "absolute", width: 82, height: 270, borderRadius: 45, background: "white" }} />
        <div style={{ position: "absolute", width: 270, height: 82, borderRadius: 45, background: "white" }} />
      </div>
    </div>,
    size,
  );
}
