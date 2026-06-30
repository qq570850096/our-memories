"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";
import type { ProvinceMapCity } from "./shared";

type SignalLayerProps = {
  activeCityIds: Set<string>;
  sentCityId: string | null;
  mapCities: ProvinceMapCity[];
};

export function SignalLayer({ activeCityIds, sentCityId, mapCities }: Readonly<SignalLayerProps>) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {mapCities.map((city) => {
        const visible = activeCityIds.has(city.id) || sentCityId === city.id;
        return (
          <AnimatePresence key={city.id}>
            {visible && (
              <motion.div
                className="absolute grid h-10 w-10 place-items-center rounded-full bg-sakura/60 text-rose shadow-[0_0_24px_rgba(216,111,130,0.28)]"
                style={{ left: city.x - 20, top: city.y - 56 }}
                initial={{ opacity: 0, scale: 0.2, y: 12 }}
                animate={{ opacity: [0, 1, 0.86], scale: [0.2, 1.18, 1], y: [12, -6, 0] }}
                exit={{ opacity: 0, scale: 0.6, y: -14 }}
                transition={{ duration: 0.62, ease: "easeOut" }}
              >
                <Heart className="h-5 w-5 fill-rose" />
              </motion.div>
            )}
          </AnimatePresence>
        );
      })}
    </div>
  );
}
