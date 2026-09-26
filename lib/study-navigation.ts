"use client";
import { useRouter } from "next/navigation";
export function useStudyNavigation() {
  const router = useRouter();
  return (path: string) => {
    if (!navigator.onLine || location.pathname === "/offline") {
      location.hash = path;
      // Offline transitions need a document request, since private RSC responses are never cached.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (location.pathname !== "/offline") location.assign(`/offline#${path}`);
    } else router.push(path);
  };
}
