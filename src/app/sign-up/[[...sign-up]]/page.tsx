import { SignUpClient } from "./sign-up-client";

export const generateStaticParams = () => [
  { "sign-up": [] },
  { "sign-up": ["sso-callback"] },
  { "sign-up": ["verify-email-address"] },
];

export default function SignUpPage() {
  return <SignUpClient />;
}
