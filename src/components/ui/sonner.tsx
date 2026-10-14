import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useStore } from "@/store/useStore"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useT } from "@/i18n"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useStore((s) => s.settings.theme)
  const t = useT()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      containerAriaLabel={t("app.toast.region")}
      {...props}
      toastOptions={{ closeButtonAriaLabel: t("app.toast.close"), ...props.toastOptions }}
    />
  )
}

export { Toaster }
