"""social sign-in: google_sub and telegram_id on users

Revision ID: 5c2e7a1d9f40
Revises: 33d66a5d3c8b
Create Date: 2026-11-14 17:10:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '5c2e7a1d9f40'
down_revision: Union[str, None] = '33d66a5d3c8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('google_sub', sa.String(length=64), nullable=True))
        batch.add_column(sa.Column('telegram_id', sa.BigInteger(), nullable=True))
        batch.create_index('ix_users_google_sub', ['google_sub'], unique=True)
        batch.create_index('ix_users_telegram_id', ['telegram_id'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.drop_index('ix_users_telegram_id')
        batch.drop_index('ix_users_google_sub')
        batch.drop_column('telegram_id')
        batch.drop_column('google_sub')
