; ────────────────────────────────────────────────────────────
; setup.iss — Instalador de Sistema Stock (Inno Setup)
;
; Qué hace:
;   1) Copia los archivos del proyecto (backend + frontend, sin
;      node_modules ni dist) a la carpeta de instalación.
;   2) Pide al usuario los datos de conexión a PostgreSQL (que el
;      usuario ya debe tener instalado — este instalador NO instala
;      PostgreSQL).
;   3) Llama a installer\postinstall.ps1, que hace el trabajo real:
;      verifica/instala Node.js, verifica PostgreSQL, genera el .env,
;      corre npm install, migraciones, seed y build.
;   4) Crea accesos directos a "Iniciar Sistema.bat".
;
; Cómo compilarlo: ver el paso a paso en la respuesta del chat.
; ────────────────────────────────────────────────────────────

#define MyAppName "Sistema Stock"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Tu Empresa"
#define MyAppExeName "Iniciar Sistema.bat"

[Setup]
AppId={{B3B6E1B4-8C1E-4B7A-9C1E-STOCKVENTAS01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SistemaStock
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Necesita admin: instala Node.js (si falta) y puede necesitar iniciar
; el servicio de Windows de PostgreSQL.
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=SistemaStock-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; IMPORTANTE: este instalador no está firmado digitalmente. Windows
; SmartScreen probablemente muestre una advertencia al ejecutarlo.
; Para producción, considerá un certificado de code signing (ver
; conversación previa sobre este tema).

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; Todo el proyecto, EXCLUYENDO lo que se genera en el target machine
; (node_modules, dist, .git, .env real) — eso lo crea postinstall.ps1.
Source: "..\stock-ventas-backend\*"; DestDir: "{app}\stock-ventas-backend"; \
    Excludes: "node_modules\*,dist\*,.env"; Flags: recursesubdirs ignoreversion
Source: "..\stock-ventas-frontend\*"; DestDir: "{app}\stock-ventas-frontend"; \
    Excludes: "node_modules\*,dist\*"; Flags: recursesubdirs ignoreversion
Source: "..\Iniciar Sistema.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\INSTALACION.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "postinstall.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
; Corre el script de post-instalación en una ventana visible (no oculta)
; para que el usuario vea el progreso de npm install / migraciones, que
; puede tardar varios minutos.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\postinstall.ps1"" -AppDir ""{app}"" -PgUser ""{code:GetPgUser}"" -PgPassword ""{code:GetPgPassword}"" -PgPort ""{code:GetPgPort}"""; \
    StatusMsg: "Configurando el sistema (esto puede tardar varios minutos)..."; \
    Flags: waituntilterminated

Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar el sistema ahora"; \
    Flags: postinstall skipifsilent nowait shellexec

[Code]
{ ────────────────────────────────────────────────────────────
  Página custom para pedir los datos de conexión a PostgreSQL.
  El usuario ya lo tiene que tener instalado (ver INSTALACION.md
  o el link que se abre si postinstall.ps1 no lo detecta).
  ──────────────────────────────────────────────────────────── }
var
  PgPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PgPage := CreateInputQueryPage(wpSelectDir,
    'Conexión a PostgreSQL',
    'Datos de tu instalación de PostgreSQL',
    'Estos son los datos que definiste al instalar PostgreSQL en este equipo. ' +
    'Si todavía no lo instalaste, cancelá este instalador, instalalo desde ' +
    'postgresql.org, y volvé a ejecutar este instalador.');

  PgPage.Add('Usuario (por defecto "postgres"):', False);
  PgPage.Add('Contraseña del usuario de PostgreSQL:', True);
  PgPage.Add('Puerto (por defecto 5432):', False);

  PgPage.Values[0] := 'postgres';
  PgPage.Values[2] := '5432';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PgPage.ID then
  begin
    if PgPage.Values[1] = '' then
    begin
      MsgBox('Ingresá la contraseña de PostgreSQL para continuar.', mbError, MB_OK);
      Result := False;
    end;
    if PgPage.Values[0] = '' then
      PgPage.Values[0] := 'postgres';
    if PgPage.Values[2] = '' then
      PgPage.Values[2] := '5432';
  end;
end;

function GetPgUser(Param: string): string;
begin
  Result := PgPage.Values[0];
end;

function GetPgPassword(Param: string): string;
begin
  Result := PgPage.Values[1];
end;

function GetPgPort(Param: string): string;
begin
  Result := PgPage.Values[2];
end;
