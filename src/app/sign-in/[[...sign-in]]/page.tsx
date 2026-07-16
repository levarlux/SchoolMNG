import { SignInClient } from "./sign-in-client";

export const generateStaticParams = () => [
  { "sign-in": [] },
  { "sign-in": ["factor-one"] },
  { "sign-in": ["factor-two"] },
  { "sign-in": ["sso-callback"] },
  { "sign-in": ["reset-password"] },
];

export default function SignInPage() {
  return <SignInClient />;
}
