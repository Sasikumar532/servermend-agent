import { Chip } from "@heroui/react";
import { severityChipProps } from "../lib/severity";

export function SeverityPill({ severity }) {
  const { color, variant, label } = severityChipProps(severity);
  return (
    <Chip color={color} variant={variant}>
      {label}
    </Chip>
  );
}
