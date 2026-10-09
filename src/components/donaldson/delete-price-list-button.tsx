"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PriceListDeleteDialog } from "@/components/donaldson/price-list-delete-dialog";
import { Button } from "@/components/ui/button";
import type { PriceList } from "@/types/api";

export function DeletePriceListButton({ priceList }: { priceList: PriceList }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2 /> Eliminar lista
      </Button>
      <PriceListDeleteDialog
        priceList={priceList}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => {
          router.replace("/donaldson/price-lists");
          router.refresh();
        }}
      />
    </>
  );
}
