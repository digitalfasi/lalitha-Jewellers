"""draft bills, saved calculator items, formula folders

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-24 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TS = [sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
      sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade() -> None:
    op.create_table('bill_drafts',
        sa.Column('id', sa.String(36), nullable=False), sa.Column('data', sa.JSON(), nullable=False),
        sa.Column('shop_name', sa.String(150)), sa.Column('line_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('grand_total', sa.Numeric(14, 2)), sa.Column('created_by_name', sa.String(100)),
        *[c.copy() for c in TS], sa.PrimaryKeyConstraint('id', name='pk_bill_drafts'))
    op.create_table('calc_items',
        sa.Column('id', sa.String(36), nullable=False), sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('title', sa.String(150), nullable=False), sa.Column('data', sa.JSON(), nullable=False),
        sa.Column('total', sa.String(60)), sa.Column('shop_name', sa.String(150)), sa.Column('created_by_name', sa.String(100)),
        *[c.copy() for c in TS], sa.PrimaryKeyConstraint('id', name='pk_calc_items'))
    op.create_index('ix_calc_items_kind', 'calc_items', ['kind'])
    with op.batch_alter_table('calc_formulas') as b:
        b.add_column(sa.Column('folder', sa.String(60), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('calc_formulas') as b:
        b.drop_column('folder')
    op.drop_index('ix_calc_items_kind', table_name='calc_items')
    op.drop_table('calc_items')
    op.drop_table('bill_drafts')
