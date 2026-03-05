"use client";

import type { ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type RouteDetailSheetProps = {
  peek: ReactNode;
  children: ReactNode;
  activeSnapPoint: number | string | null;
  setActiveSnapPoint: (snap: number | string | null) => void;
};

const SNAP_POINTS = [0.25, 0.55, 0.92];

export function RouteDetailSheet({
  peek,
  children,
  activeSnapPoint,
  setActiveSnapPoint,
}: RouteDetailSheetProps) {
  return (
    <DrawerPrimitive.Root
      open
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      modal={false}
      dismissible={false}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex h-[96dvh] flex-col rounded-t-3xl bg-white"
          style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.12)" }}
          aria-describedby={undefined}
        >
          <VisuallyHidden>
            <DrawerPrimitive.Title>Detalhes da rota</DrawerPrimitive.Title>
          </VisuallyHidden>
          {/* Grab handle */}
          <div className="flex justify-center py-3">
            <div className="h-1 w-9 rounded-full bg-zinc-300" />
          </div>

          {/* Fixed peek section — always visible at top */}
          <div className="shrink-0 px-5">{peek}</div>

          {/* Scrollable content — timeline below */}
          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(3rem+env(safe-area-inset-bottom))]"
            style={{
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
