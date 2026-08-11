# ============================================================
# ARIGA — Crea la cuenta de administrador (o cualquier usuario)
# directamente en Supabase Auth vía la Admin API, con el correo
# ya confirmado (email_confirm: true) y lista para iniciar sesión
# de inmediato.
#
# Por qué así y no un INSERT directo en auth.users: la tabla
# auth.users tiene columnas internas (hash bcrypt, tokens, aud,
# role, etc.) que Supabase no documenta ni garantiza — insertarlas
# a mano es frágil. La Admin API es la forma soportada.
#
# Como esta cuenta se crea con app_metadata.app = 'ariga' desde el
# inicio, el trigger trg_auth_alta_usuario (ya existe en tu base)
# la da de alta automáticamente en public.usuarios con el rol
# indicado — no hace falta ningún paso adicional en el SQL editor.
#
# Uso:
#   1) Edita $Correo, $Contrasena, $Nombre y $Rol abajo.
#   2) Ejecuta:  pwsh -File supabase/scripts/crear_admin.ps1
#      (o desde este mismo PowerShell: .\supabase\scripts\crear_admin.ps1)
# ============================================================

$Correo     = 'admin@ariga.com'
$Contrasena = 'Admin123456'   # mínimo 8 caracteres; cámbiala después de iniciar sesión
$Nombre     = 'Administrador ARIGA'
$Rol        = 'admin'   # admin | coordinador | supervisor | asesor
                         # | embajador | tienda | produccion | contabilidad

if ($Contrasena.Length -lt 8) {
    Write-Error "La contraseña debe tener al menos 8 caracteres."
    exit 1
}

# Lee URL y service_role key desde .env.local (no se hardcodean aquí)
$envPath = Join-Path $PSScriptRoot '..\..\.env.local'
$envContent = Get-Content $envPath -Raw

function Get-EnvValue([string]$name, [string]$content) {
    if ($content -match "(?m)^$name=(.*)$") { return $Matches[1].Trim() }
    throw "No se encontró $name en .env.local"
}

$SupabaseUrl  = Get-EnvValue 'NEXT_PUBLIC_SUPABASE_URL' $envContent
$ServiceRole  = Get-EnvValue 'SUPABASE_SERVICE_ROLE_KEY' $envContent

$body = @{
    email         = $Correo
    password      = $Contrasena
    email_confirm = $true
    app_metadata  = @{ app = 'ariga'; rol = $Rol }
    user_metadata = @{ nombre = $Nombre }
} | ConvertTo-Json -Depth 5

try {
    $respuesta = Invoke-RestMethod `
        -Uri "$SupabaseUrl/auth/v1/admin/users" `
        -Method Post `
        -Headers @{
            apikey        = $ServiceRole
            Authorization = "Bearer $ServiceRole"
            'Content-Type' = 'application/json'
        } `
        -Body $body

    Write-Host "Usuario creado: $($respuesta.email) (auth_uid: $($respuesta.id))" -ForegroundColor Green
    Write-Host "Ya puede iniciar sesión en /login con el correo y la contraseña definidos arriba." -ForegroundColor Green
    Write-Host "Verificado por el trigger de la base: revisa la tabla public.usuarios para confirmar el alta con rol '$Rol'." -ForegroundColor Yellow
}
catch {
    $detalle = $_.ErrorDetails.Message
    Write-Error "No se pudo crear el usuario: $detalle"
}
