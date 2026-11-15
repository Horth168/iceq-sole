"""orders.channel: online shop or in-store POS

Revision ID: 7d1f3b2a9c51
Revises: 5c2e7a1d9f40
Create Date: 2026-11-15 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '7d1f3b2a9c51'
down_revision: Union[str, None] = '5c2e7a1d9f40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('orders') as batch:
        batch.add_column(sa.Column('channel', sa.String(length=10), nullable=False, server_default='online'))
        batch.create_index('ix_orders_channel', ['channel'])


def downgrade() -> None:
    with op.batch_alter_table('orders') as batch:
        batch.drop_index('ix_orders_channel')
        batch.drop_column('channel')
