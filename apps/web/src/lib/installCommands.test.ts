import { describe, expect, it } from 'vitest';
import { buildInstallCommands } from './installCommands';

const base = {
  apiUrl: 'https://rmm.example.com',
  token: 'enroll_abc123',
};

describe('buildInstallCommands', () => {
  describe('macOS / Linux (install.sh based)', () => {
    it('routes through the server-generated install.sh for both platforms', () => {
      const cmds = buildInstallCommands(base);
      for (const cmd of [cmds.macos, cmds.linux]) {
        expect(cmd).toContain('https://rmm.example.com/api/v1/agents/install.sh');
        expect(cmd).toContain('--server "https://rmm.example.com"');
        expect(cmd).toContain('--token "enroll_abc123"');
      }
      // The script auto-detects the OS; both platforms get the same command.
      expect(cmds.macos).toBe(cmds.linux);
    });

    it('downloads to a mktemp path and verifies the shebang before sudo bash', () => {
      const { macos } = buildInstallCommands(base);
      // Guards against an intercepting device serving HTML where the script
      // should be: never pipe straight into bash, check for #! first.
      expect(macos).toContain('mktemp');
      expect(macos).toContain("grep -q '^#!'");
      expect(macos).not.toContain('| sudo bash');
    });

    it('scopes the connectivity error to the fetch + shebang check', () => {
      const { macos } = buildInstallCommands(base);
      expect(macos).toContain('Could not fetch the Breeze installer from https://rmm.example.com');
      // The fallback must wrap only the fetch/verify group: install.sh prints
      // its own precise errors, so a failure inside `sudo bash` must NOT
      // trigger the "could not fetch" message.
      expect(macos.indexOf('Could not fetch')).toBeLessThan(macos.indexOf('sudo bash'));
      // Must surface a failing exit code without closing the user's shell.
      expect(macos).toContain('false; }');
      expect(macos).not.toContain('exit 1');
    });

    it('sends the error to stderr and bounds the bootstrap fetch', () => {
      const { macos } = buildInstallCommands(base);
      // MDM/RMM log collectors split streams — the actionable message must
      // land on stderr like install.sh's own errors do.
      expect(macos).toContain('>&2');
      // Against a DROP-style firewall the user should not stare at a silent
      // prompt for curl's ~2min default connect timeout.
      expect(macos).toContain('--connect-timeout 10');
    });

    it('appends --enrollment-secret only when a secret is provided', () => {
      const withSecret = buildInstallCommands({ ...base, enrollmentSecret: 's3cret' });
      expect(withSecret.macos).toContain('--enrollment-secret "s3cret"');
      expect(buildInstallCommands(base).macos).not.toContain('--enrollment-secret');
    });
  });

  describe('Windows (PowerShell)', () => {
    it('fetches the server function with a timeout, checks its prefix, then invokes it with the token', () => {
      const { windows } = buildInstallCommands(base);
      const fetchStart = windows.indexOf('irm ');
      const fetchEnd = windows.indexOf(';', fetchStart);
      const fetchRequest = windows.slice(fetchStart, fetchEnd);

      expect(windows.startsWith("& { $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12;")).toBe(true);
      expect(fetchRequest).toContain('irm "https://rmm.example.com/api/v1/agents/install.ps1" -UseBasicParsing -TimeoutSec 10');
      expect(fetchRequest).not.toContain(base.token);
      expect(fetchRequest).not.toContain('token=');
      expect(fetchRequest).not.toContain('secret=');
      expect(windows).toContain("if($s -notmatch '^\\s*function\\s+Install-BreezeAgent\\b'");
      expect(windows.indexOf('-notmatch')).toBeGreaterThan(fetchStart);
      expect(windows.indexOf('-notmatch')).toBeLessThan(windows.indexOf('iex $s'));
      expect(windows.indexOf('iex $s')).toBeLessThan(windows.indexOf('Install-BreezeAgent -Token'));
      expect(windows.endsWith(' }')).toBe(true);
      expect(windows).toContain(`Install-BreezeAgent -Token "${base.token}"`);
      expect(windows).not.toContain('Authorization:');
      expect(windows).not.toContain('Get-FileHash');
      expect(windows).not.toContain('New-Item');
      expect(windows).not.toContain('icacls');
    });

    it('passes the optional enrollment secret only to the function call', () => {
      const withSecret = buildInstallCommands({ ...base, enrollmentSecret: 's3cret' });
      const fetchStart = withSecret.windows.indexOf('irm ');
      const fetchEnd = withSecret.windows.indexOf(';', fetchStart);
      const fetchRequest = withSecret.windows.slice(fetchStart, fetchEnd);

      expect(fetchRequest).not.toContain('s3cret');
      expect(withSecret.windows).toContain(`Install-BreezeAgent -Token "${base.token}" -EnrollmentSecret "s3cret"`);
      expect(buildInstallCommands(base).windows).not.toContain('-EnrollmentSecret');
    });
  });

  it('never interpolates a bare $identifier immediately followed by a colon inside a double-quoted string', () => {
    // Inside a double-quoted PowerShell string, "$name:" is parsed as a
    // drive-qualified variable reference (equivalent to ${name:...}), not as
    // the variable "$name" followed by a literal colon — PowerShell raises a
    // hard parse error unless "name" happens to be a real PSDrive (env,
    // global, script, local, function, variable, alias, cert, hklm, hkcu,
    // wsman, ...). Any other bare "$identifier:" inside a double-quoted
    // string aborts the whole one-liner before a single statement runs.
    // Wrap the variable in braces ("${identifier}:") to interpolate it
    // safely and unambiguously instead.
    const knownDriveQualifiedPrefixes = new Set([
      'env',
      'global',
      'script',
      'local',
      'private',
      'function',
      'variable',
      'alias',
      'cert',
      'hklm',
      'hkcu',
      'hkcr',
      'hkey_local_machine',
      'hkey_current_user',
      'wsman',
    ]);
    const { windows } = buildInstallCommands(base);
    const offenders: string[] = [];
    for (const dq of windows.match(/"(?:[^"\\]|\\.)*"/g) ?? []) {
      for (const m of dq.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*):/g)) {
        if (!knownDriveQualifiedPrefixes.has(m[1].toLowerCase())) {
          offenders.push(`${m[0]} in ${dq}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('strips trailing slashes from apiUrl', () => {
    const cmds = buildInstallCommands({
      ...base,
      apiUrl: 'https://rmm.example.com/',
    });
    expect(cmds.macos).toContain('https://rmm.example.com/api/v1/agents/install.sh');
    expect(cmds.macos).not.toContain('com//');
    expect(cmds.windows).toContain('https://rmm.example.com/api/v1/agents/install.ps1');
    expect(cmds.windows).not.toContain('com//');
  });
});
