import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";

import type { RootStackParamList } from "@/app/navigation/types";
import { Button } from "@/components/Button";
import { useSupabase } from "@/lib/supabase";

import { canModerate } from "./moderationApi";

/** "Duyệt nội dung" for moderators and super admins; nothing for everyone else, or when the check fails. */
export function ModerationEntry({ userId }: { userId: string }) {
  const supabase = useSupabase();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [allowed, setAllowed] = useState<{
    userId: string;
    value: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    canModerate(supabase, userId).then(
      (value) => active && setAllowed({ userId, value }),
      () => active && setAllowed({ userId, value: false }),
    );
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  if (allowed?.userId !== userId || !allowed.value) return null;
  return (
    <Button
      title="Duyệt nội dung"
      icon="shield-checkmark-outline"
      variant="soft"
      onPress={() => navigation.navigate("Moderation")}
    />
  );
}
