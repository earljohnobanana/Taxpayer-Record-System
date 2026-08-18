import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

/* Reusable password field with a show/hide (eye) toggle so the person can
   see exactly what they typed. */
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

const emptyForm = {
  username: "",
  fullName: "",
  password: "",
  confirmPassword: "",
};

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function switchMode(next) {
    setMode(next);
    setForm(emptyForm);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isRegister) {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await register({
          username: form.username,
          fullName: form.fullName,
          password: form.password,
        });
        toast.success("Account created. Welcome!");
      } else {
        await login(form.username, form.password);
        toast.success("Welcome");
      }
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <img
        src={logo}
        alt="Municipality of Santa Catalina, Negros Oriental official seal"
        className="mb-6 h-44 w-44 object-contain"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{isRegister ? "Create account" : "Sign in"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Municipal Treasurer&apos;s Office — Santa Catalina, Negros Oriental
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={form.username}
                onChange={set("username")}
              />
            </div>

            {isRegister && (
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={set("fullName")}
                />
              </div>
            )}

            <PasswordField
              id="password"
              label="Password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={form.password}
              onChange={set("password")}
            />

            {isRegister && (
              <>
                <PasswordField
                  id="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                />
              </>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? isRegister
                  ? "Creating account..."
                  : "Signing in..."
                : isRegister
                ? "Create account"
                : "Sign in"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => switchMode("signin")}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                No account yet?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => switchMode("register")}
                >
                  Create one
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
