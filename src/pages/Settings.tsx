import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Building2, Upload, Palette, Tag, Save, X } from "lucide-react";

export default function Settings() {
  const { organization, organizationId, isLoading } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("funeraria");
  const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
  const [secondaryColor, setSecondaryColor] = useState("#1e293b");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (organization) {
      const org = organization as any;
      setName(org.name || "");
      setNiche(org.niche || "funeraria");
      setPrimaryColor(org.primary_color || "#0ea5e9");
      setSecondaryColor(org.secondary_color || "#1e293b");
      if (org.logo_url) setLogoPreview(org.logo_url);
    }
  }, [organization]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não encontrada");

      let logoUrl = (organization as any)?.logo_url || null;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${organizationId}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      } else if (!logoPreview) {
        logoUrl = null;
      }

      const { error } = await supabase
        .from("organizations")
        .update({
          name,
          niche,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl,
        })
        .eq("id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-membership"] });
      toast({ title: "Configurações salvas com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize sua empresa</p>
        </div>

        {/* Nome da Empresa */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Dados da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome da Empresa</Label>
              <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Nicho */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> Nicho de Atuação
            </CardTitle>
            <CardDescription>Termos e campos serão ajustados conforme o nicho</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={niche} onValueChange={setNiche} className="grid grid-cols-2 gap-4">
              {[
                { value: "funeraria", label: "Funerária", desc: "Planos funerários, cobranças de mensalidades" },
                { value: "crediario", label: "Crediário", desc: "Carnês, parcelas e cobranças recorrentes" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    niche === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} className="mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Logo */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Logo da Empresa
            </CardTitle>
            <CardDescription>PNG ou JPG, máximo 2MB</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50 shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="logoUpload"
                  className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-primary hover:underline"
                >
                  <Upload className="h-4 w-4" /> Enviar imagem
                </Label>
                <input
                  id="logoUpload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                {logoPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="h-3 w-3" /> Remover
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cores */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" /> Cores da Marca
            </CardTitle>
            <CardDescription>Personalize as cores do sistema da sua empresa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-10 rounded-lg border border-border cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor Secundária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-10 w-10 rounded-lg border border-border cursor-pointer"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="mt-4 p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Pré-visualização</p>
              <div className="flex gap-3">
                <div className="h-10 flex-1 rounded-md flex items-center justify-center text-xs font-medium" style={{ background: primaryColor, color: "#fff" }}>
                  Primária
                </div>
                <div className="h-10 flex-1 rounded-md flex items-center justify-center text-xs font-medium" style={{ background: secondaryColor, color: "#fff" }}>
                  Secundária
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Salvar */}
        <div className="flex justify-end pb-6">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gradient-primary text-primary-foreground"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
