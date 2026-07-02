import { FormEvent, useState } from "react";
import { Button } from "../../components/Button";
import { useCreateUser } from "./hooks";
import { UserRole } from "../../types";

export const CreateUserForm = () => {
  const createUser = useCreateUser();
  const [role, setRole] = useState<UserRole>("student");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [subjects, setSubjects] = useState("");

  const needsDepartment = role === "student" || role === "mentor";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createUser.mutate(
      {
        email,
        name,
        role,
        department: needsDepartment ? department : undefined,
        subjects:
          role === "mentor" && subjects
            ? subjects.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
      },
      {
        onSuccess: () => {
          setEmail("");
          setName("");
          setDepartment("");
          setSubjects("");
        },
      }
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-700">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
          >
            <option value="student">Student</option>
            <option value="mentor">Mentor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-700">Full name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
        />
      </label>

      {needsDepartment && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-700">Department</span>
          <input
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
          />
        </label>
      )}

      {role === "mentor" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-700">
            Subjects <span className="text-ink-300">(comma separated, optional)</span>
          </span>
          <input
            value={subjects}
            onChange={(e) => setSubjects(e.target.value)}
            placeholder="Algorithms, Data Structures"
            className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
          />
        </label>
      )}

      <Button type="submit" disabled={createUser.isPending} className="mt-1">
        {createUser.isPending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
};
