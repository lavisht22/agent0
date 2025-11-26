import { queryOptions } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const workspacesQuery = queryOptions({
    queryKey: ["workspaces"],
    queryFn: async () => {
        const { data, error } = await supabase.from("workspaces").select("*");

        if (error) throw error;

        return data;
    },
})