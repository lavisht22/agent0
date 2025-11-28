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

export const providersQuery = (workspaceId: string) => queryOptions({
    queryKey: ["providers", workspaceId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("providers")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!workspaceId,
})

export const agentsQuery = (workspaceId: string) => queryOptions({
    queryKey: ["agents", workspaceId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("agents")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!workspaceId,
})