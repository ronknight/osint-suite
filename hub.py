#!/usr/bin/env python3
import os
import sys
import subprocess
import time
from dotenv import load_dotenv

# Try to import termcolor, gracefully fail if not present
try:
    from termcolor import colored
except ImportError:
    def colored(text, color=None, on_color=None, attrs=None):
        return text

# Load environment variables from .env file
load_dotenv()

TOOLS = {
    "1": {
        "name": "Blackbird",
        "dir": "blackbird",
        "cmd": "python3 blackbird.py",
        "desc": "Find usernames across social media sites."
    },
    "2": {
        "name": "Sherlock",
        "dir": "sherlock/sherlock_project",
        "cmd": "python3 sherlock.py",
        "desc": "Hunt down social media accounts by username."
    },
    "3": {
        "name": "TheHarvester",
        "dir": "theHarvester",
        "cmd": "python3 theHarvester.py",
        "desc": "Gather emails, subdomains, hosts, employee names, open ports."
    },
    "4": {
        "name": "SpiderFoot",
        "dir": "spiderfoot",
        "cmd": "python3 sf.py",
        "desc": "Automate OSINT collection (Web UI & CLI)."
    },
    "5": {
        "name": "Photon",
        "dir": "Photon",
        "cmd": "python3 photon.py",
        "desc": "Incredibly fast crawler designed for OSINT."
    },
    "6": {
        "name": "Holehe",
        "dir": "holehe",
        "cmd": "python3 -m holehe", # Running as module often safer
        "desc": "Check if an email is attached to accounts (no login used)."
    },
    "7": {
        "name": "Maigret",
        "dir": "maigret",
        "cmd": "python3 -m maigret",
        "desc": "Collect a dossier on a person by username (HTML reports)."
    },
    "8": {
        "name": "GHunt",
        "dir": "ghunt",
        "cmd": "python3 -m ghunt.cli", # Check entry point
        "desc": "Investigate Google accounts."
    },
    "9": {
        "name": "DNSRecon",
        "dir": "dnsrecon",
        "cmd": "python3 dnsrecon.py",
        "desc": "DNS Enumeration Script."
    },
    "10": {
        "name": "Metagoofil",
        "dir": "metagoofil",
        "cmd": "python3 metagoofil.py",
        "desc": "Extract metadata from public documents (pdf, doc, xls)."
    },
    "11": {
        "name": "Sublist3r",
        "dir": "Sublist3r",
        "cmd": "python3 sublist3r.py",
        "desc": "Fast subdomains enumeration tool."
    },
     "12": {
        "name": "Waybackurls",
        "dir": "waybackurls",
        "cmd": "go run main.go",
        "desc": "Fetch known URLs from the Wayback Machine."
    },
     "13": {
        "name": "Amass",
        "dir": "amass",
        "cmd": "go run cmd/amass/main.go", # Assuming go installed
        "desc": "In-depth Attack Surface Mapping and Asset Discovery."
    },
     "14": {
        "name": "Recon-ng",
        "dir": "recon-ng",
        "cmd": "./recon-ng", # Executable script
        "desc": "Full-featured Web Reconnaissance framework."
    },
    "15": {
        "name": "Nikto",
        "dir": "nikto/program",
        "cmd": "perl nikto.pl",
        "desc": "Comprehensive web server scanner."
    },
    "16": {
        "name": "SQLMap",
        "dir": "sqlmap",
        "cmd": "python3 sqlmap.py",
        "desc": "Automatic SQL injection and database takeover tool."
    },
    "17": {
        "name": "Shodan CLI",
        "dir": "shodan-python",
        "cmd": "python3 -m shodan",
        "desc": "Official CLI for Shodan."
    },
    "18": {
        "name": "WafW00f",
        "dir": "wafw00f",
        "cmd": "python3 -m wafw00f.main",
        "desc": "Identify and fingerprint Web Application Firewalls."
    }
}

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    clear_screen()
    print(colored("=========================================", "cyan"))
    print(colored("       OSINT SUITE CENTRAL HUB           ", "yellow", attrs=['bold']))
    print(colored("=========================================", "cyan"))
    print(colored(f"Logged in as: {os.environ.get('USER', 'User')}", "green"))
    print("\n")

def list_tools():
    print_header()
    print("Available Tools:\n")
    for key, tool in TOOLS.items():
        print(f"[{key}] {colored(tool['name'], 'green', attrs=['bold'])}")
        print(f"    {tool['desc']}")
    print("\n[q] Quit")

def launch_tool(key):
    if key not in TOOLS:
        print(colored("\nInvalid selection!", "red"))
        time.sleep(1)
        return

    tool = TOOLS[key]
    print(colored(f"\nLaunching {tool['name']}...", "yellow"))
    
    # Check if directory exists
    target_dir = os.path.join(os.getcwd(), tool['dir'])
    if not os.path.exists(target_dir):
        print(colored(f"Error: Directory {target_dir} not found. Did you clone submodules?", "red"))
        print("Try running: git submodule update --init --recursive")
        input("Press Enter to continue...")
        return

    # Construct the command
    # We change directory to the tool's folder, run the command, then come back (implied by subprocess)
    print(f"Working Directory: {target_dir}")
    print(f"Command: {tool['cmd']}")
    print(colored("------------------------------------------------", "cyan"))
    
    try:
        # Running the command in the tool's directory
        # Using a shell to allow for arguments if the user wants to type them later?
        # Ideally, we just drop them into the tool's help menu first
        cmd = f"{tool['cmd']} --help" 
        
        # Determine if we should run help or let user interact
        print(colored("Do you want to run the tool directly with arguments, or see help first?", "blue"))
        print("1. See Help (default)")
        print("2. Enter arguments manually")
        print("3. Enter interactive mode (if available)")
        
        choice = input("Choice: ").strip()
        
        final_cmd = tool['cmd']
        
        if choice == '2':
            args = input(f"Enter arguments for {tool['name']}: ")
            final_cmd = f"{tool['cmd']} {args}"
        elif choice == '3':
            # Just run the command (some tools are interactive shells)
            pass
        else:
            final_cmd = f"{tool['cmd']} --help"

        subprocess.run(final_cmd, cwd=target_dir, shell=True)
        
    except KeyboardInterrupt:
        print(colored("\nTool execution interrupted.", "red"))
    
    print(colored("\n------------------------------------------------", "cyan"))
    input("Press Enter to return to Hub...")

def main():
    while True:
        list_tools()
        choice = input("\nSelect a tool (or 'q' to quit): ").strip().lower()
        
        if choice == 'q':
            print("Exiting...")
            sys.exit(0)
        
        launch_tool(choice)

if __name__ == "__main__":
    main()
