"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { getMyFavouriteIds, mergeDeviceFavouritesAction, toggleFavouriteAction } from "@/features/account/actions";

const LOCAL_KEY = "bite-affairs:favourites:v1";

interface FavCtx {
  ids: Set<string>;
  isFavourite: (id: string) => boolean;
  toggle: (id: string, name?: string) => Promise<void>;
  persistent: boolean;
  /** True once the favourite ids have been loaded for the current session. */
  ready: boolean;
}
const Ctx = createContext<FavCtx | null>(null);

function readLocal(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Account favourites when signed in; temporary browser-only favourites for guests. */
export function FavouritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (status === "authenticated") {
      // Favourites saved on this device while signed out move into the account (then the device copy is dropped).
      const local = readLocal();
      const load = local.length ? mergeDeviceFavouritesAction(local) : getMyFavouriteIds();
      load.then((res) => {
        if (cancelled || !res.ok) return;
        if (local.length) {
          try {
            localStorage.removeItem(LOCAL_KEY);
          } catch {}
        }
        setIds(new Set(res.data.ids));
        setReady(true);
      });
    } else if (status === "unauthenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from browser storage
      setIds(new Set(readLocal()));
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggle = useCallback(
    async (id: string, name?: string) => {
      const wasFav = ids.has(id);
      const next = new Set(ids);
      if (wasFav) next.delete(id);
      else next.add(id);
      setIds(next);
      if (status === "authenticated") {
        const res = await toggleFavouriteAction(id);
        if (!res.ok) {
          setIds(ids);
          toast.error(res.error);
          return;
        }
        toast.success(res.data.favourite ? `${name ?? "Item"} added to favourites` : `${name ?? "Item"} removed from favourites`);
      } else {
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify([...next]));
        } catch {}
        if (!wasFav) toast(`${name ?? "Item"} saved on this device`, { description: "Sign in to keep favourites across devices." });
      }
    },
    [ids, status],
  );

  return <Ctx.Provider value={{ ids, isFavourite: (id) => ids.has(id), toggle, persistent: status === "authenticated", ready }}>{children}</Ctx.Provider>;
}

export function useFavourites() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavourites must be used inside FavouritesProvider");
  return ctx;
}
