#!/usr/bin/env python3
"""
Comprehensive tokenizer inspection tool.
Analyzes special tokens, chat templates, and token registration for thinking-capable models.
"""

import sys
from pathlib import Path

# Add backend to path
BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from transformers import AutoTokenizer

def inspect_tokenizer(model_name: str):
    """Inspect tokenizer attributes."""
    print(f"\n{'='*80}")
    print(f"Inspecting tokenizer: {model_name}")
    print(f"{'='*80}\n")
    
    try:
        print("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        print("✅ Tokenizer loaded successfully")
        print(f"Tokenizer class: {type(tokenizer).__name__}")
        
        # Check chat_template attribute
        print(f"\n{'='*80}")
        print("CHAT TEMPLATE INSPECTION")
        print(f"{'='*80}")
        
        if hasattr(tokenizer, 'chat_template'):
            chat_template = tokenizer.chat_template
            if chat_template:
                print("✅ chat_template is set")
                print("\nTemplate content:")
                print("-"*80)
                print(chat_template)
                print("-"*80)
                
                # Check if template mentions thinking
                if 'thinking' in chat_template.lower() or 'think' in chat_template:
                    print("\n✅ Template contains 'think' or 'thinking' keywords")
                else:
                    print("\n⚠️  Template does NOT contain 'think' or 'thinking' keywords")
            else:
                print("❌ chat_template attribute exists but is None/empty")
        else:
            print("❌ chat_template attribute does not exist")
        
        # Check for default_chat_template
        if hasattr(tokenizer, 'default_chat_template'):
            print(f"\n✅ default_chat_template exists: {tokenizer.default_chat_template}")
        
        # Check tokenizer config
        print(f"\n{'='*80}")
        print("TOKENIZER CONFIG")
        print(f"{'='*80}")
        
        if hasattr(tokenizer, 'init_kwargs'):
            print(f"Init kwargs: {tokenizer.init_kwargs}")
        
        # Try to get the tokenizer config file
        try:
            from transformers import AutoConfig
            config = AutoConfig.from_pretrained(model_name)
            print(f"\nModel config type: {type(config).__name__}")
            if hasattr(config, 'chat_template'):
                print(f"Config has chat_template: {config.chat_template}")
        except Exception as e:
            print(f"Could not load config: {e}")
        
        # Check special tokens
        print(f"\n{'='*80}")
        print("SPECIAL TOKENS")
        print(f"{'='*80}")
        print(f"bos_token: {tokenizer.bos_token}")
        print(f"eos_token: {tokenizer.eos_token}")
        print(f"pad_token: {tokenizer.pad_token}")
        print(f"unk_token: {tokenizer.unk_token}")
        
        if hasattr(tokenizer, 'additional_special_tokens'):
            print(f"additional_special_tokens: {tokenizer.additional_special_tokens}")
        
        # Check if specific tokens exist
        test_tokens = ['<|im_start|>', '<|im_end|>', '<think>', '</think>']
        print(f"\n{'='*80}")
        print("CHECKING FOR SPECIFIC TOKENS")
        print(f"{'='*80}")
        for token in test_tokens:
            token_id = tokenizer.convert_tokens_to_ids(token)
            # Check if it's a valid token (not unknown)
            unk_id = tokenizer.unk_token_id if hasattr(tokenizer, 'unk_token_id') else None
            if token_id != unk_id:
                print(f"✅ '{token}' exists (id: {token_id})")
            else:
                print(f"❌ '{token}' not found (maps to unk)")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    models_to_test = [
        "PleIAs/Monad",
        "PleIAs/Baguettotron",
    ]
    
    for model_name in models_to_test:
        try:
            inspect_tokenizer(model_name)
        except KeyboardInterrupt:
            print("\n\n⚠️  Inspection interrupted by user")
            break
        except Exception as e:
            print(f"\n❌ Failed to inspect {model_name}: {e}")
