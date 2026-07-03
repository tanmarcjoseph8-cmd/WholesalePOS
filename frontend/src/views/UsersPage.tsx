import { ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, fetchUsers, updateUser } from "../lib/api";

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "CASHIER" as "ADMINISTRATOR" | "CASHIER"
  });
  const users = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      setForm({ name: "", email: "", password: "", role: "CASHIER" });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
  const updateMutation = useMutation({
    mutationFn: updateUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Users & Permissions</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Create administrator and cashier accounts for this device.</p>
      </div>

      <form
        className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate(form);
        }}
      >
        <label className="text-sm font-semibold">
          Name
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Email
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Password
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            type="password"
            minLength={12}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Role
          <select
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as "ADMINISTRATOR" | "CASHIER" }))}
          >
            <option value="CASHIER">Cashier</option>
            <option value="ADMINISTRATOR">Administrator</option>
          </select>
        </label>
        <button className="focus-ring mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ocean px-4 text-sm font-bold text-white" disabled={createMutation.isPending}>
          <UserPlus size={18} />
          {createMutation.isPending ? "Creating..." : "Create User"}
        </button>
        {createMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose md:col-span-2 xl:col-span-5">{createMutation.error.message}</p> : null}
      </form>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  Loading users...
                </td>
              </tr>
            ) : users.data?.length ? (
              users.data.map((user) => (
                <tr key={user.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <ShieldCheck size={16} />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      className="focus-ring rounded-md border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: user.id, status: user.isActive ? "INACTIVE" : "ACTIVE" })}
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
